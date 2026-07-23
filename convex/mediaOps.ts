import { v } from "convex/values"
import { internalMutation, mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"
import { assertNoActivePublishAttempt, findActivePublishAttempt } from "./lib/publishAttemptGuard"

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
      // If replacing a Convex-stored file, delete the old storage entry first.
      if (existingPending.convexStorageId && existingPending.convexStorageId !== args.convexStorageId) {
        try {
          await ctx.storage.delete(existingPending.convexStorageId)
        } catch {
          // Storage entry may already be gone; don't block the update.
        }
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
        updatedAt: now,
      })
      return existingPending._id
    }

    const { projectAccessToken: _projectAccessToken, ...storableArgs } = args
    return await ctx.db.insert("mediaOps", {
      ...storableArgs,
      userId,
      status: "pending",
      commitSha: undefined,
      createdAt: now,
      updatedAt: now,
    })
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

      await ctx.db.patch(id, {
        status: "committed",
        commitSha: args.commitSha,
        publishBranchId: args.publishBranchId,
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

    // Delete from Convex storage before marking undone - no orphans.
    if (pending.convexStorageId) {
      try {
        await ctx.storage.delete(pending.convexStorageId)
      } catch {
        // File may already be gone; don't block the undo.
      }
    }

    await ctx.db.patch(pending._id, {
      status: "undone",
      updatedAt: Date.now(),
    })

    return pending._id
  },
})

export const clearCommittedForProject = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")

    const committed = await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "committed"))
      .collect()

    for (const op of committed) {
      await ctx.db.delete(op._id)
    }
  },
})

/**
 * Delete all Convex storage files for a closed/merged publish branch and mark those ops as undone.
 * Called by the PR-closed and PR-merged webhook handlers.
 */
export const cleanupMediaForBranch = internalMutation({
  args: {
    publishBranchId: v.id("publishBranches"),
  },
  handler: async (ctx, args) => {
    const branch = await ctx.db.get(args.publishBranchId)
    if (!branch) return

    // Never undo media while a publish attempt is at the commit boundary for
    // this project - the in-flight commit may contain these ops. The skip is
    // DURABLE: the branch is flagged and the nightly cron finishes the
    // cleanup once the attempt resolves (the webhook only fires once).
    if (await findActivePublishAttempt(ctx.db, branch.projectId)) {
      await ctx.db.patch(branch._id, { mediaCleanupPending: true, updatedAt: Date.now() })
      return
    }

    await cleanupBranchMediaRows(ctx, args.publishBranchId, branch.projectId)
    if (branch.mediaCleanupPending) {
      await ctx.db.patch(branch._id, { mediaCleanupPending: undefined, updatedAt: Date.now() })
    }
  },
})

async function cleanupBranchMediaRows(ctx: { db: any; storage: any }, publishBranchId: string, projectId: string) {
  const ops = await ctx.db
    .query("mediaOps")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .filter((q: any) => q.eq(q.field("publishBranchId"), publishBranchId))
    .filter((q: any) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "committed")))
    .collect()

  const now = Date.now()
  for (const op of ops) {
    if (op.convexStorageId) {
      try {
        await ctx.storage.delete(op.convexStorageId)
      } catch {
        // Already gone.
      }
    }
    await ctx.db.patch(op._id, { status: "undone", updatedAt: now })
  }
}

/**
 * Stale cleanup: delete Convex storage files for pending mediaOps older than 7 days
 * that were never associated with a publish branch (truly abandoned staging files).
 * Runs nightly via cron.
 */
export const cleanupStaleUploads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days ago

    // Collect stale pending ops - no branch, old createdAt, has Convex storage.
    // We must scan by status since we don't have a createdAt index.
    const staleBatchSize = 100
    let processed = 0

    const allPending = await ctx.db
      .query("mediaOps")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "pending"),
          q.eq(q.field("sourceType"), "convex"),
          q.lt(q.field("createdAt"), cutoff),
        ),
      )
      .take(staleBatchSize)

    const now = Date.now()
    // Cache active-attempt lookups per project within this run.
    const activeAttemptByProject = new Map<string, boolean>()
    for (const op of allPending) {
      // Skip rows whose project has a publish attempt at the commit
      // boundary; the next nightly run collects them once it resolves.
      let attemptActive = activeAttemptByProject.get(op.projectId)
      if (attemptActive === undefined) {
        attemptActive = (await findActivePublishAttempt(ctx.db, op.projectId)) !== null
        activeAttemptByProject.set(op.projectId, attemptActive)
      }
      if (attemptActive) continue

      if (op.convexStorageId) {
        try {
          await ctx.storage.delete(op.convexStorageId)
        } catch {
          // Already gone.
        }
      }
      await ctx.db.patch(op._id, { status: "undone", updatedAt: now })
      processed++
    }

    // Finish PR-close cleanups that were durably skipped while a publish
    // attempt was at the commit boundary (the webhook fires only once; the
    // committed rows it targets are outside the stale-pending pass above).
    const flaggedBranches = await ctx.db
      .query("publishBranches")
      .withIndex("by_mediaCleanupPending", (q) => q.eq("mediaCleanupPending", true))
      .take(10)
    let flaggedCleaned = 0
    for (const branch of flaggedBranches) {
      let attemptActive = activeAttemptByProject.get(branch.projectId)
      if (attemptActive === undefined) {
        attemptActive = (await findActivePublishAttempt(ctx.db, branch.projectId)) !== null
        activeAttemptByProject.set(branch.projectId, attemptActive)
      }
      if (attemptActive) continue

      await cleanupBranchMediaRows(ctx, branch._id, branch.projectId)
      await ctx.db.patch(branch._id, { mediaCleanupPending: undefined, updatedAt: Date.now() })
      flaggedCleaned++
    }

    return { processed, flaggedCleaned }
  },
})
