import { v } from "convex/values"
import { canonicalGitPathFromUrlPath } from "../lib/git-path-policy"
import { internalMutation, mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"
import { invalidateClosedLaneSync } from "./lib/laneInvalidation"
import { finalizeMergedLaneSync } from "./lib/laneMerge"
import { deleteOwnedMediaStorageOrKeepTombstone, deleteUnownedStorageOrTombstone } from "./lib/mediaTombstone"
import { completeCloseVerificationIfIdle, completeMergeVerificationIfIdle } from "./lib/publishAttemptCleanup"
import { assertNoActivePublishAttempt, findActivePublishAttempt } from "./lib/publishAttemptGuard"
import { requireCommittedAttempt, requireMediaAssociation } from "./lib/publishAttemptOwnership"

const STALE_UPLOAD_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const ACTIVE_ATTEMPT_STORAGE_DEFER_MS = 60 * 60 * 1000

/** Generate a one-time upload URL for Convex file storage. The caller POSTs raw bytes to this URL and receives a storageId in response. */
export const generateConvexUploadUrl = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")
    return await ctx.storage.generateUploadUrl()
  },
})

/** Get the serving URL for a Convex-stored file given the mediaOp's projectId + repoPath. Used by the resolve proxy for preview. */
export const getConvexStorageUrl = query({
  args: {
    projectId: v.id("projects"),
    repoPath: v.string(),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return null

    const op = await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_repoPath", (q) => q.eq("projectId", args.projectId).eq("repoPath", args.repoPath))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first()

    if (!op?.convexStorageId) return null
    return await ctx.storage.getUrl(op.convexStorageId)
  },
})

export const stage = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    repoPath: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.optional(v.number()),
    sourceFilePath: v.optional(v.string()),
    sourceType: v.union(v.literal("blob"), v.literal("githubBranch"), v.literal("convex")),
    blobUrl: v.optional(v.string()),
    blobAccess: v.optional(v.union(v.literal("public"), v.literal("private"))),
    githubBranch: v.optional(v.string()),
    githubPath: v.optional(v.string()),
    githubSha: v.optional(v.string()),
    convexStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveProjectAccess(ctx, args, "editor")

    const now = Date.now()
    const existingPending = await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_repoPath", (q) => q.eq("projectId", args.projectId).eq("repoPath", args.repoPath))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first()

    if (existingPending) {
      // Replacing an existing pending row mutates bytes an active publish
      // attempt may have planned - refuse while one is at the commit
      // boundary (a brand-new row below is safe: no attempt references it).
      // The refusal is a structured RESULT, not a throw: the caller already
      // stored the new bytes, and this mutation must COMMIT for the
      // storage delete below to take effect (a thrown mutation rolls its
      // storage writes back, orphaning the rejected object). A failed
      // delete leaves a durable "failed" tombstone row that owns the
      // object so the nightly cron retries it.
      if (await findActivePublishAttempt(ctx.db, args.projectId)) {
        if (args.convexStorageId && args.convexStorageId !== existingPending.convexStorageId) {
          await deleteUnownedStorageOrTombstone(ctx, {
            projectId: args.projectId,
            userId,
            repoPath: args.repoPath,
            fileName: args.fileName,
            mimeType: args.mimeType,
            convexStorageId: args.convexStorageId,
          })
        }
        return { staged: false as const, reason: "publish-in-progress" as const }
      }
      // If replacing a Convex-stored file, delete the old storage entry
      // first - the patch below drops the row's reference to it, so a
      // failed delete must also leave an owning tombstone.
      if (existingPending.convexStorageId && existingPending.convexStorageId !== args.convexStorageId) {
        await deleteUnownedStorageOrTombstone(ctx, {
          projectId: args.projectId,
          userId,
          repoPath: args.repoPath,
          fileName: existingPending.fileName,
          mimeType: existingPending.mimeType,
          convexStorageId: existingPending.convexStorageId,
        })
      }
      await ctx.db.patch(existingPending._id, {
        fileName: args.fileName,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        sourceFilePath: args.sourceFilePath,
        sourceType: args.sourceType,
        blobUrl: args.blobUrl,
        blobAccess: args.blobAccess,
        githubBranch: args.githubBranch,
        githubPath: args.githubPath,
        githubSha: args.githubSha,
        convexStorageId: args.convexStorageId,
        status: "pending",
        commitSha: undefined,
        storageCleanupAt: args.sourceType === "convex" ? now + STALE_UPLOAD_AFTER_MS : undefined,
        storageDeleteAttempts: undefined,
        updatedAt: now,
      })
      return { staged: true as const, mediaOpId: existingPending._id }
    }

    const { projectAccessToken: _projectAccessToken, ...storableArgs } = args
    const mediaOpId = await ctx.db.insert("mediaOps", {
      ...storableArgs,
      userId,
      status: "pending",
      commitSha: undefined,
      storageCleanupAt: args.sourceType === "convex" ? now + STALE_UPLOAD_AFTER_MS : undefined,
      createdAt: now,
      updatedAt: now,
    })
    return { staged: true as const, mediaOpId }
  },
})

export const listPending = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return []

    return await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "pending"))
      .collect()
  },
})

export const getPendingByRepoPath = query({
  args: {
    projectId: v.id("projects"),
    repoPath: v.string(),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return null

    return await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_repoPath", (q) => q.eq("projectId", args.projectId).eq("repoPath", args.repoPath))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first()
  },
})

export const markCommitted = mutation({
  args: {
    ids: v.array(v.id("mediaOps")),
    commitSha: v.string(),
    publishBranchId: v.optional(v.id("publishBranches")),
    publishAttemptId: v.optional(v.id("publishAttempts")),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    // Media ops from the publish snapshot that can no longer be marked
    // committed even though the commit contains their changes (undone in a
    // race). Reported so the caller surfaces the divergence; committed ops
    // are idempotent retries, not drift.
    const unreconciledMediaOpIds: Array<(typeof args.ids)[number]> = []
    for (const id of args.ids) {
      const op = await ctx.db.get(id)
      if (!op || op.status === "undone") {
        unreconciledMediaOpIds.push(id)
      }
      if (!op || op.status !== "pending") continue

      await resolveProjectAccess(
        ctx,
        { projectId: op.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
        "editor",
      )

      if (args.publishAttemptId !== undefined) {
        const publishAttempt = await requireCommittedAttempt(ctx.db, {
          attemptId: args.publishAttemptId,
          projectId: op.projectId,
          publishBranchId: args.publishBranchId,
          commitSha: args.commitSha,
        })
        requireMediaAssociation(publishAttempt, {
          mediaOpId: id,
          repoPath: canonicalGitPathFromUrlPath(op.repoPath),
          expectedUpdatedAt: op.updatedAt,
        })
      }

      await ctx.db.patch(id, {
        status: "committed",
        commitSha: args.commitSha,
        publishBranchId: args.publishBranchId,
        publishAttemptId: args.publishAttemptId,
        updatedAt: now,
      })
    }
    return { unreconciledMediaOpIds }
  },
})

export const undoByRepoPath = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    repoPath: v.string(),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")

    // A publish attempt at the commit boundary may already have (or be about
    // to have) a Git commit containing this media op.
    await assertNoActivePublishAttempt(ctx.db, args.projectId)

    const pending = await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_repoPath", (q) => q.eq("projectId", args.projectId).eq("repoPath", args.repoPath))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first()

    if (!pending) return null

    // Storage-backed rows remain owners until deletion succeeds. A failure
    // converts this exact row into the retryable tombstone.
    if (pending.convexStorageId) {
      await deleteOwnedMediaStorageOrKeepTombstone(ctx, pending)
      return pending._id
    }

    await ctx.db.patch(pending._id, {
      status: "undone",
      updatedAt: Date.now(),
    })

    return pending._id
  },
})

/**
 * Stale cleanup: delete Convex storage files for pending mediaOps older than 7 days
 * that were never associated with a publish branch (truly abandoned staging files).
 * Runs nightly via cron.
 */
export const cleanupStaleUploads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()

    // Bounded indexed read of stale pending uploads.
    const staleBatchSize = 100
    let processed = 0

    const allPending = await ctx.db
      .query("mediaOps")
      .withIndex("by_storage_cleanup_eligibility", (q) =>
        q
          .eq("status", "pending")
          .eq("sourceType", "convex")
          .eq("publishBranchId", undefined)
          .lte("storageCleanupAt", now),
      )
      .take(staleBatchSize)

    // Cache active-attempt lookups per project within this run.
    const activeAttemptByProject = new Map<string, boolean>()
    for (const op of allPending) {
      // Rows staged before storageCleanupAt existed sort into the bounded
      // undefined prefix. Give fresh legacy uploads their real stale
      // deadline and move them out of that prefix without deleting early.
      if (op.storageCleanupAt === undefined) {
        const legacyCleanupAt = op.createdAt + STALE_UPLOAD_AFTER_MS
        if (legacyCleanupAt > now) {
          await ctx.db.patch(op._id, { storageCleanupAt: legacyCleanupAt })
          continue
        }
      }
      // Skip rows whose project has a publish attempt at the commit
      // boundary; the next nightly run collects them once it resolves.
      let attemptActive = activeAttemptByProject.get(op.projectId)
      if (attemptActive === undefined) {
        attemptActive = (await findActivePublishAttempt(ctx.db, op.projectId)) !== null
        activeAttemptByProject.set(op.projectId, attemptActive)
      }
      if (attemptActive) {
        await ctx.db.patch(op._id, {
          storageCleanupAt: now + ACTIVE_ATTEMPT_STORAGE_DEFER_MS,
          updatedAt: now,
        })
        continue
      }

      if (op.convexStorageId) await deleteOwnedMediaStorageOrKeepTombstone(ctx, op)
      else await ctx.db.patch(op._id, { status: "undone", storageCleanupAt: undefined, updatedAt: now })
      processed++
    }

    // Retry storage deletes owned by durable "failed" tombstone rows (a
    // rejected replacement or discarded upload whose delete failed). On
    // success the tombstone has served its purpose and is removed.
    const failedTombstones = await ctx.db
      .query("mediaOps")
      .withIndex("by_storage_cleanup_eligibility", (q) =>
        q
          .eq("status", "failed")
          .eq("sourceType", "convex")
          .eq("publishBranchId", undefined)
          .lte("storageCleanupAt", now),
      )
      .take(50)
    let tombstonesCleared = 0
    for (const tombstone of failedTombstones) {
      const result = await deleteOwnedMediaStorageOrKeepTombstone(ctx, tombstone)
      if (result.deleted) tombstonesCleared++
    }

    // Finish lane synchronization cleanups (closed-lane invalidation or
    // merged-lane finalization, dispatched by their persisted action) that were durably
    // deferred behind a publish attempt or split across bounded batches
    // (the close/merge event fires only once; the committed rows and
    // document provenance they target are outside the passes above).
    const flaggedBranches = await ctx.db
      .query("publishBranches")
      .withIndex("by_laneInvalidationPending", (q) => q.eq("laneInvalidationPending", true))
      .take(10)
    let lanesCleaned = 0
    for (const branch of flaggedBranches) {
      const action = branch.laneCleanupAction
      if (action !== "restore_legacy" && action !== "finalize_legacy") continue
      let attemptActive = activeAttemptByProject.get(branch.projectId)
      if (attemptActive === undefined) {
        attemptActive = (await findActivePublishAttempt(ctx.db, branch.projectId)) !== null
        activeAttemptByProject.set(branch.projectId, attemptActive)
      }
      if (attemptActive) continue

      const cleanup =
        action === "finalize_legacy"
          ? await finalizeMergedLaneSync(ctx, branch)
          : await invalidateClosedLaneSync(ctx, branch)
      if (!cleanup.deferred && cleanup.done) {
        if (action === "finalize_legacy") await completeMergeVerificationIfIdle(ctx, branch._id)
        else await completeCloseVerificationIfIdle(ctx, branch._id)
        lanesCleaned++
      }
    }

    return { processed, tombstonesCleared, lanesCleaned }
  },
})
