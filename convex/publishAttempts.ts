import { v } from "convex/values"
import {
  assertCanonicalPublishOperationPath,
  canonicalGitPathFromUrlPath,
  gitRepositoryPathIdentity,
} from "../lib/git-path-policy"
import { resolveStoredRepoPath, type StoredPathRepresentation } from "../lib/preview/path-policy"
import { verifyServerQueryToken } from "../lib/project-access-token"
import { internal } from "./_generated/api"
import { mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"
import { findActivePublishAttempt } from "./lib/publishAttemptGuard"
import { assertValidPublishCleanupPlan } from "./lib/publishCleanupAuthority"

const MAX_ATTEMPT_OPERATIONS = 500
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^[0-9a-f]{64}$/

const operationDescriptorValidator = v.union(
  v.object({ path: v.string(), action: v.literal("delete") }),
  v.object({
    path: v.string(),
    action: v.union(v.literal("create"), v.literal("update")),
    expectedBlobSha: v.string(),
  }),
)

const deleteAssociationValidator = v.object({
  opId: v.id("explorerOps"),
  documentId: v.id("documents"),
  expectedUpdatedAt: v.number(),
})

const pathOutcomeValidator = v.object({
  path: v.string(),
  disposition: v.union(v.literal("finalize"), v.literal("restore"), v.literal("discard")),
  finalBlobSha: v.optional(v.string()),
})

/**
 * The publish attempt that has crossed (or is crossing) the commit boundary
 * for a project, if any. Used by the publish route to recover a crashed
 * attempt before starting a new one.
 */
export const getActiveForProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return null
    const pendingMergeLane = await ctx.db
      .query("publishBranches")
      .withIndex("by_projectId_mergeVerificationState", (q) =>
        q.eq("projectId", args.projectId).eq("mergeVerificationState", "pending"),
      )
      .order("desc")
      .first()
    if (pendingMergeLane?.status === "merged") {
      const candidates = await Promise.all(
        (["cleanup_pending", "committing", "committed", "reconciled"] as const).map((status) =>
          ctx.db
            .query("publishAttempts")
            .withIndex("by_publishBranchId_status", (q) =>
              q.eq("publishBranchId", pendingMergeLane._id).eq("status", status),
            )
            .order("desc")
            .first(),
        ),
      )
      const newest = candidates
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
        .sort((a, b) => b.createdAt - a.createdAt)[0]
      if (newest) return newest
    }
    return await findActivePublishAttempt(ctx.db, args.projectId)
  },
})

/**
 * Newest attempt that still owns synchronization state on one verified
 * closed lane. Reused lanes can contain several reconciled publishes, so
 * lifecycle sync drains these one at a time in reverse creation order.
 */
export const getNewestUnresolvedForLane = query({
  args: {
    projectId: v.id("projects"),
    laneId: v.id("publishBranches"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return null
    const lane = await ctx.db.get(args.laneId)
    if (!lane || lane.projectId !== args.projectId || lane.status !== "closed") return null
    const candidates = await Promise.all(
      (["cleanup_pending", "committing", "committed", "reconciled"] as const).map((status) =>
        ctx.db
          .query("publishAttempts")
          .withIndex("by_publishBranchId_status", (q) => q.eq("publishBranchId", lane._id).eq("status", status))
          .order("desc")
          .first(),
      ),
    )
    return (
      candidates
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    )
  },
})

/**
 * Record a publish attempt just before the CAS commit. Refuses while another
 * attempt is still active - the route must recover or supersede it first.
 */
export const begin = mutation({
  args: {
    projectId: v.id("projects"),
    publishBranchId: v.id("publishBranches"),
    branchName: v.string(),
    expectedHeadSha: v.string(),
    planDigest: v.string(),
    operationDescriptors: v.array(operationDescriptorValidator),
    opIds: v.array(v.id("explorerOps")),
    mediaAssociations: v.array(
      v.object({
        mediaOpId: v.id("mediaOps"),
        repoPath: v.string(),
        expectedUpdatedAt: v.number(),
      }),
    ),
    documentAssociations: v.array(
      v.object({
        documentId: v.id("documents"),
        repoPath: v.string(),
        expectedUpdatedAt: v.number(),
        contentRevision: v.optional(v.string()),
        contentVersion: v.optional(v.number()),
      }),
    ),
    deleteAssociations: v.array(deleteAssociationValidator),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectAccess(
      ctx,
      { projectId: args.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    const active = await findActivePublishAttempt(ctx.db, args.projectId)
    if (active) {
      throw new Error("Another publish attempt is still active for this project")
    }

    // ── Shape bounds and duplicate rejection ──
    if (!SHA_PATTERN.test(args.expectedHeadSha)) throw new Error("Publish attempt expected head must be a 40-hex SHA")
    if (!DIGEST_PATTERN.test(args.planDigest)) throw new Error("Publish attempt plan digest must be a 64-hex digest")
    if (!args.branchName.startsWith("repopress/") || args.branchName.startsWith("repopress/install/")) {
      throw new Error("Publish attempt branch must be a repopress/ publish lane")
    }
    if (args.operationDescriptors.length === 0) {
      throw new Error("Publish attempt requires at least one operation descriptor")
    }
    if (
      args.opIds.length > MAX_ATTEMPT_OPERATIONS ||
      args.mediaAssociations.length > MAX_ATTEMPT_OPERATIONS ||
      args.documentAssociations.length > MAX_ATTEMPT_OPERATIONS ||
      args.deleteAssociations.length > MAX_ATTEMPT_OPERATIONS ||
      args.operationDescriptors.length > MAX_ATTEMPT_OPERATIONS * 2
    ) {
      throw new Error("Publish attempt exceeds the staged operation bounds")
    }
    const descriptorPaths = new Set<string>()
    const descriptorByIdentity = new Map<string, (typeof args.operationDescriptors)[number]>()
    for (const descriptor of args.operationDescriptors) {
      assertCanonicalPublishOperationPath(descriptor.path)
      const pathIdentity = gitRepositoryPathIdentity(descriptor.path)
      if (descriptorPaths.has(pathIdentity)) {
        throw new Error("Publish attempt contains duplicate operation descriptor paths")
      }
      descriptorPaths.add(pathIdentity)
      descriptorByIdentity.set(pathIdentity, descriptor)
      if (descriptor.action === "delete") {
        if ("expectedBlobSha" in descriptor) throw new Error("Delete descriptor must not contain a blob SHA")
      } else if (!SHA_PATTERN.test(descriptor.expectedBlobSha)) {
        throw new Error("Publish attempt write descriptor blob SHA must be a 40-hex SHA")
      }
    }
    for (const association of args.documentAssociations) {
      if (association.contentRevision !== undefined && !DIGEST_PATTERN.test(association.contentRevision)) {
        throw new Error("Publish attempt content revision must be a 64-hex digest")
      }
      if (
        association.contentVersion !== undefined &&
        (!Number.isInteger(association.contentVersion) || association.contentVersion < 0)
      ) {
        throw new Error("Publish attempt content version must be a non-negative integer")
      }
      assertCanonicalPublishOperationPath(association.repoPath)
      const descriptor = descriptorByIdentity.get(gitRepositoryPathIdentity(association.repoPath))
      if (
        !descriptor ||
        descriptor.path !== association.repoPath ||
        (descriptor.action !== "create" && descriptor.action !== "update")
      ) {
        throw new Error("Publish attempt document association has no matching write descriptor")
      }
    }
    for (const association of args.mediaAssociations) {
      assertCanonicalPublishOperationPath(association.repoPath)
      const descriptor = descriptorByIdentity.get(gitRepositoryPathIdentity(association.repoPath))
      if (
        !descriptor ||
        descriptor.path !== association.repoPath ||
        (descriptor.action !== "create" && descriptor.action !== "update")
      ) {
        throw new Error("Publish attempt media association has no matching write descriptor")
      }
    }
    const opIdSet = new Set(args.opIds.map(String))
    const mediaIdSet = new Set(args.mediaAssociations.map((a) => String(a.mediaOpId)))
    if (opIdSet.size !== args.opIds.length || mediaIdSet.size !== args.mediaAssociations.length) {
      throw new Error("Publish attempt contains duplicate operation references")
    }
    if (new Set(args.documentAssociations.map((a) => String(a.documentId))).size !== args.documentAssociations.length) {
      throw new Error("Publish attempt contains duplicate document associations")
    }
    if (new Set(args.deleteAssociations.map((a) => String(a.opId))).size !== args.deleteAssociations.length) {
      throw new Error("Publish attempt contains duplicate delete associations")
    }

    // ── Transactional snapshot-freshness validation ──
    // The route planned this publish from an earlier read. Everything the
    // attempt is about to commit must STILL be in that planned state inside
    // this transaction - otherwise a discard/undo/save that raced planning
    // could be committed silently from stale in-memory content.
    const lane = await ctx.db.get(args.publishBranchId)
    if (!lane || lane.projectId !== args.projectId || lane.branchName !== args.branchName) {
      throw new Error("Publish attempt lane does not match the project's publish branch")
    }
    const contentRoot = access.project.contentRoot
    const coveredDescriptorIdentities = new Set<string>()
    const opById = new Map<string, { opType: string; repoPath: string }>()
    const explorerAssociations: Array<{
      opId: (typeof args.opIds)[number]
      repoPath: string
      expectedUpdatedAt: number
    }> = []
    for (const opId of args.opIds) {
      const op = await ctx.db.get(opId)
      if (!op || op.projectId !== args.projectId) {
        throw new Error("Publish attempt references an explorer op outside the project")
      }
      if (op.status !== "pending") {
        throw new Error("Staged changes changed since planning: an operation is no longer pending")
      }
      const repoPath = resolveStoredRepoPath(
        contentRoot,
        op.filePath,
        op.pathRepresentation as StoredPathRepresentation | undefined,
      )
      opById.set(String(opId), {
        opType: op.opType,
        repoPath,
      })
      const descriptor = descriptorByIdentity.get(gitRepositoryPathIdentity(repoPath))
      if (!descriptor || descriptor.path !== repoPath || descriptor.action !== op.opType) {
        throw new Error("Publish attempt explorer association has no matching operation descriptor")
      }
      coveredDescriptorIdentities.add(gitRepositoryPathIdentity(repoPath))
      explorerAssociations.push({ opId, repoPath, expectedUpdatedAt: op.updatedAt })
    }
    for (const association of args.mediaAssociations) {
      const mediaOp = await ctx.db.get(association.mediaOpId)
      if (!mediaOp || mediaOp.projectId !== args.projectId) {
        throw new Error("Publish attempt references a media op outside the project")
      }
      if (mediaOp.status !== "pending") {
        throw new Error("Staged changes changed since planning: a media upload is no longer pending")
      }
      // Versioned snapshot: an in-place replacement (new bytes, new source)
      // bumps updatedAt, and a moved upload changes repoPath - both must
      // reject rather than committing stale bytes and then marking the
      // NEW row committed.
      if (canonicalGitPathFromUrlPath(mediaOp.repoPath) !== association.repoPath) {
        throw new Error("Staged changes changed since planning: a media upload path no longer matches")
      }
      if (mediaOp.updatedAt !== association.expectedUpdatedAt) {
        throw new Error("Staged changes changed since planning: a media upload was replaced")
      }
      const descriptor = descriptorByIdentity.get(gitRepositoryPathIdentity(association.repoPath))
      const expectedAction = mediaOp.githubSha ? "update" : "create"
      if (!descriptor || descriptor.path !== association.repoPath || descriptor.action !== expectedAction) {
        throw new Error("Publish attempt media association does not match its operation descriptor")
      }
      coveredDescriptorIdentities.add(gitRepositoryPathIdentity(association.repoPath))
    }
    const validateDocumentSnapshot = async (association: {
      documentId: (typeof args.documentAssociations)[number]["documentId"]
      repoPath: string
      expectedUpdatedAt: number
    }) => {
      const document = await ctx.db.get(association.documentId)
      if (!document || document.projectId !== args.projectId) {
        throw new Error("Publish attempt references a document outside the project")
      }
      if (document.updatedAt !== association.expectedUpdatedAt) {
        throw new Error("Staged changes changed since planning: a document was edited or discarded")
      }
      const resolvedPath = resolveStoredRepoPath(
        contentRoot,
        document.filePath,
        document.pathRepresentation as StoredPathRepresentation | undefined,
      )
      if (resolvedPath !== association.repoPath) {
        throw new Error("Staged changes changed since planning: a document path no longer matches")
      }
    }
    for (const association of args.documentAssociations) {
      await validateDocumentSnapshot(association)
      coveredDescriptorIdentities.add(gitRepositoryPathIdentity(association.repoPath))
    }
    for (const association of args.deleteAssociations) {
      const owningOp = opById.get(String(association.opId))
      if (!owningOp || owningOp.opType !== "delete") {
        throw new Error("Delete association must reference a pending delete operation included in this attempt")
      }
      const descriptor = descriptorByIdentity.get(gitRepositoryPathIdentity(owningOp.repoPath))
      if (!descriptor || descriptor.path !== owningOp.repoPath || descriptor.action !== "delete") {
        throw new Error("Delete association has no matching delete descriptor")
      }
      // The associated document must still match the planned snapshot AND
      // resolve to the same path as its owning delete operation.
      await validateDocumentSnapshot({
        documentId: association.documentId,
        repoPath: owningOp.repoPath,
        expectedUpdatedAt: association.expectedUpdatedAt,
      })
    }
    if (coveredDescriptorIdentities.size !== descriptorByIdentity.size) {
      throw new Error("Publish attempt operation descriptor has no owning persisted association")
    }

    const now = Date.now()
    return await ctx.db.insert("publishAttempts", {
      projectId: args.projectId,
      publishBranchId: args.publishBranchId,
      branchName: args.branchName,
      expectedHeadSha: args.expectedHeadSha,
      planDigest: args.planDigest,
      operationDescriptors: args.operationDescriptors,
      operationPaths: args.operationDescriptors.map((descriptor) => descriptor.path),
      opIds: args.opIds,
      explorerAssociations,
      mediaAssociations: args.mediaAssociations,
      documentAssociations: args.documentAssociations,
      deleteAssociations: args.deleteAssociations,
      status: "committing",
      createdAt: now,
      updatedAt: now,
    })
  },
})

function canonicalCleanupPlan(
  authoritySha: string | undefined,
  pathOutcomes: Array<{ path: string; disposition: "finalize" | "restore" | "discard"; finalBlobSha?: string }>,
) {
  return JSON.stringify({
    authoritySha,
    pathOutcomes: [...pathOutcomes].sort((a, b) => a.path.localeCompare(b.path)),
  })
}

/**
 * Atomically install the immutable cleanup decision for one resolved attempt.
 * The attempt remains active until every bounded continuation has completed.
 */
export const resolveAndEnqueueCleanup = mutation({
  args: {
    id: v.id("publishAttempts"),
    authoritySha: v.optional(v.string()),
    pathOutcomes: v.array(pathOutcomeValidator),
    serverQueryToken: v.string(),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.id)
    if (!attempt) throw new Error("Publish attempt not found")
    const { project } = await resolveProjectAccess(
      ctx,
      { projectId: attempt.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    if (!(await verifyServerQueryToken(args.serverQueryToken))) {
      throw new Error("Unauthorized: valid server proof is required for publish cleanup")
    }
    const lane = await ctx.db.get(attempt.publishBranchId)
    const plan = {
      projectId: attempt.projectId,
      laneId: attempt.publishBranchId,
      attemptId: attempt._id,
      authoritySha: args.authoritySha,
      pathOutcomes: args.pathOutcomes,
    }
    const cleanupMode = assertValidPublishCleanupPlan({ project, lane, attempt, plan, stage: "enqueue" })
    if (!lane) throw new Error("Publish cleanup lane disappeared during validation")

    const existing = await ctx.db
      .query("publishAttemptCleanups")
      .withIndex("by_attemptId", (q) => q.eq("attemptId", attempt._id))
      .first()
    let normalizedOutcomes = [...args.pathOutcomes].sort((a, b) => a.path.localeCompare(b.path))
    if (cleanupMode.kind === "merged") {
      const mergeAuthoritySha = cleanupMode.authoritySha
      const unresolved = await Promise.all(
        (["cleanup_pending", "committing", "committed", "reconciled"] as const).map((status) =>
          ctx.db
            .query("publishAttempts")
            .withIndex("by_publishBranchId_status", (q) => q.eq("publishBranchId", lane._id).eq("status", status))
            .order("desc")
            .first(),
        ),
      )
      const newest = unresolved
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
        .sort((a, b) => b.createdAt - a.createdAt)[0]
      if (newest && newest._id !== attempt._id) {
        throw new Error("Merged publish attempts must be reconciled newest-first")
      }
      const arbitrated: typeof normalizedOutcomes = []
      for (const outcome of normalizedOutcomes) {
        const existingClaim = await ctx.db
          .query("publishLanePathResolutions")
          .withIndex("by_lane_authority_path", (q) =>
            q.eq("laneId", lane._id).eq("authoritySha", mergeAuthoritySha).eq("repoPath", outcome.path),
          )
          .first()
        if (existingClaim && existingClaim.claimedAttemptId !== attempt._id) {
          arbitrated.push({ path: outcome.path, disposition: "discard" })
          continue
        }
        if (!existing && !existingClaim && outcome.disposition === "finalize") {
          const now = Date.now()
          await ctx.db.insert("publishLanePathResolutions", {
            projectId: attempt.projectId,
            laneId: lane._id,
            authoritySha: mergeAuthoritySha,
            repoPath: outcome.path,
            claimedAttemptId: attempt._id,
            createdAt: now,
            updatedAt: now,
          })
        }
        arbitrated.push(outcome)
      }
      normalizedOutcomes = arbitrated
    }
    assertValidPublishCleanupPlan({
      project,
      lane,
      attempt,
      plan: { ...plan, pathOutcomes: normalizedOutcomes },
      stage: "enqueue",
    })
    const requestedPlan = canonicalCleanupPlan(args.authoritySha, normalizedOutcomes)
    if (existing) {
      if (canonicalCleanupPlan(existing.authoritySha, existing.pathOutcomes) !== requestedPlan) {
        throw new Error("Conflicting cleanup plan already exists for this publish attempt")
      }
      if (
        attempt.cleanupId !== existing._id ||
        (attempt.status !== "cleanup_pending" && attempt.status !== "cleaned")
      ) {
        throw new Error("Publish attempt and cleanup plan disagree")
      }
      if (existing.status === "pending") {
        await ctx.scheduler.runAfter(0, (internal as any).publishAttemptCleanups.continueCleanup, {
          cleanupId: existing._id,
        })
      }
      return { cleanupId: existing._id, reused: true as const }
    }
    if (attempt.cleanupId || attempt.status === "cleanup_pending" || attempt.status === "cleaned") {
      throw new Error("Publish attempt cleanup state is missing its durable plan")
    }

    const now = Date.now()
    const cleanupId = await ctx.db.insert("publishAttemptCleanups", {
      projectId: attempt.projectId,
      laneId: attempt.publishBranchId,
      attemptId: attempt._id,
      pathOutcomes: normalizedOutcomes,
      authoritySha: args.authoritySha,
      phase: "explorer",
      cursor: 0,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(attempt._id, { status: "cleanup_pending", cleanupId, updatedAt: now })
    await ctx.scheduler.runAfter(0, (internal as any).publishAttemptCleanups.continueCleanup, { cleanupId })
    return { cleanupId, reused: false as const }
  },
})

/**
 * Record the landed commit SHA. Valid from "committing" (normal flow and
 * recovery of a crash between commit and this record) and idempotently from
 * "committed" when the same SHA is re-recorded on retry.
 */
export const recordCommit = mutation({
  args: {
    id: v.id("publishAttempts"),
    commitSha: v.string(),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.id)
    if (!attempt) throw new Error("Publish attempt not found")
    await resolveProjectAccess(
      ctx,
      { projectId: attempt.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    if (attempt.status === "committed" && attempt.commitSha === args.commitSha) return
    if (attempt.status !== "committing") {
      throw new Error(`Cannot record a commit on a ${attempt.status} publish attempt`)
    }
    await ctx.db.patch(args.id, { status: "committed", commitSha: args.commitSha, updatedAt: Date.now() })
  },
})

/** Close out an attempt whose Convex reconciliation completed. */
export const markReconciled = mutation({
  args: {
    id: v.id("publishAttempts"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.id)
    if (!attempt) throw new Error("Publish attempt not found")
    await resolveProjectAccess(
      ctx,
      { projectId: attempt.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    if (attempt.status === "reconciled") return
    if (attempt.status !== "committed") {
      throw new Error(`Cannot reconcile a ${attempt.status} publish attempt`)
    }
    await ctx.db.patch(args.id, { status: "reconciled", updatedAt: Date.now() })
  },
})

/**
 * Retire an attempt whose commit provably never landed (branch head still at
 * - or moved past without - the attempt's expected head and no attempt
 * trailer on the head commit). Only "committing" attempts can be superseded;
 * a "committed" attempt has a real commit and must be reconciled instead.
 */
export const supersede = mutation({
  args: {
    id: v.id("publishAttempts"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.id)
    if (!attempt) throw new Error("Publish attempt not found")
    await resolveProjectAccess(
      ctx,
      { projectId: attempt.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    if (attempt.status === "superseded") return
    if (attempt.status !== "committing") {
      throw new Error(`Cannot supersede a ${attempt.status} publish attempt`)
    }
    await ctx.db.patch(args.id, { status: "superseded", updatedAt: Date.now() })
  },
})

/**
 * A closed lane can retire a pre-recordCommit attempt only when every exact
 * association is still the pending snapshot captured by begin. Any raced
 * undo/replacement fails closed instead of silently releasing the guard.
 */
export const supersedeClosedPending = mutation({
  args: {
    id: v.id("publishAttempts"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.id)
    if (!attempt) throw new Error("Publish attempt not found")
    const access = await resolveProjectAccess(
      ctx,
      { projectId: attempt.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    if (attempt.status === "superseded") return
    if (attempt.status !== "committing" || attempt.commitSha) {
      throw new Error(`Cannot safely supersede a ${attempt.status} publish attempt`)
    }
    const lane = await ctx.db.get(attempt.publishBranchId)
    if (!lane || lane.projectId !== attempt.projectId || lane.status !== "closed") {
      throw new Error("Safe pending supersede requires the attempt's closed lane")
    }
    for (const association of attempt.explorerAssociations ?? []) {
      const row = await ctx.db.get(association.opId)
      const repoPath =
        row &&
        resolveStoredRepoPath(
          access.project.contentRoot,
          row.filePath,
          row.pathRepresentation as StoredPathRepresentation | undefined,
        )
      if (
        !row ||
        row.projectId !== attempt.projectId ||
        row.status !== "pending" ||
        row.updatedAt !== association.expectedUpdatedAt ||
        repoPath !== association.repoPath
      ) {
        throw new Error("A publish association is no longer pending at its planned snapshot")
      }
    }
    for (const association of attempt.mediaAssociations) {
      const row = await ctx.db.get(association.mediaOpId)
      if (
        !row ||
        row.projectId !== attempt.projectId ||
        row.status !== "pending" ||
        row.updatedAt !== association.expectedUpdatedAt ||
        canonicalGitPathFromUrlPath(row.repoPath) !== association.repoPath
      ) {
        throw new Error("A publish media association is no longer pending at its planned snapshot")
      }
    }
    for (const association of attempt.documentAssociations) {
      const document = await ctx.db.get(association.documentId)
      const repoPath =
        document &&
        resolveStoredRepoPath(
          access.project.contentRoot,
          document.filePath,
          document.pathRepresentation as StoredPathRepresentation | undefined,
        )
      if (
        !document ||
        document.projectId !== attempt.projectId ||
        document.updatedAt !== association.expectedUpdatedAt ||
        repoPath !== association.repoPath ||
        (association.contentVersion !== undefined && (document.contentVersion ?? 0) !== association.contentVersion)
      ) {
        throw new Error("A publish document association is no longer pending at its planned snapshot")
      }
    }
    await ctx.db.patch(args.id, { status: "superseded", updatedAt: Date.now() })
  },
})
