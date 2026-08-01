import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"
import { internalMutation, mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"
import { invalidateClosedLaneSync } from "./lib/laneInvalidation"
import { finalizeMergedLaneSync } from "./lib/laneMerge"
import { completeMergeVerificationIfIdle } from "./lib/publishAttemptCleanup"
import { recordMergedLaneAuthority } from "./lib/publishBranchMerge"

async function getCurrentBranchForProject(
  ctx: QueryCtx,
  args: { projectId: Id<"projects">; userId?: string; projectAccessToken?: string },
) {
  const access = await resolveProjectReader(ctx, args)
  if (!access) return null

  return await ctx.db
    .query("publishBranches")
    .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "active"))
    .first()
}

/** Returns the active publish branch for a project (at most one). */
export const getActiveForProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: getCurrentBranchForProject,
})

/** Returns the current publish branch for a project (at most one). */
export const getCurrentForProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: getCurrentBranchForProject,
})

/**
 * Lane whose GitHub PR status should be synchronized. Unlike the reusable
 * current-lane query, this can return a legacy merged lane missing its
 * immutable merge authority so the authenticated fallback can backfill it.
 */
export const getStatusSyncCandidateForProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return null
    for (const status of ["active", "inactive"] as const) {
      const lane = await ctx.db
        .query("publishBranches")
        .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", status))
        .order("desc")
        .first()
      if (lane?.prNumber) return lane
    }
    const legacyMerged = await ctx.db
      .query("publishBranches")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "merged"))
      .order("desc")
      .take(25)
    return legacyMerged.find((lane) => lane.prNumber && !lane.mergeCommitSha) ?? null
  },
})

/**
 * Fetch a publish branch by ID for attempt recovery. Returns null when the
 * caller cannot read the backing project.
 */
export const getById = query({
  args: {
    id: v.id("publishBranches"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const branch = await ctx.db.get(args.id)
    if (!branch) return null
    const access = await resolveProjectReader(ctx, {
      projectId: branch.projectId,
      userId: args.userId,
      projectAccessToken: args.projectAccessToken,
    })
    if (!access) return null
    return branch
  },
})

/** Lists the current and inactive publish branches that are still open for a project. */
export const listOpenForProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return []

    const [activeBranches, inactiveBranches] = await Promise.all([
      ctx.db
        .query("publishBranches")
        .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "active"))
        .take(100),
      ctx.db
        .query("publishBranches")
        .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "inactive"))
        .take(100),
    ])

    return [...activeBranches, ...inactiveBranches]
  },
})

/** Lists branch names from open (active + inactive) publish branches for allocation. */
export const listBranchNamesForProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return []

    const [activeBranches, inactiveBranches] = await Promise.all([
      ctx.db
        .query("publishBranches")
        .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "active"))
        .take(100),
      ctx.db
        .query("publishBranches")
        .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "inactive"))
        .take(100),
    ])

    return [...activeBranches, ...inactiveBranches].map((branch) => branch.branchName)
  },
})

/** Create a new publish branch record. */
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    branchName: v.string(),
    baseBranch: v.string(),
    deactivateBranchId: v.optional(v.id("publishBranches")),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")

    const existingActiveBranch = await ctx.db
      .query("publishBranches")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "active"))
      .first()

    if (existingActiveBranch && existingActiveBranch._id !== args.deactivateBranchId) {
      throw new Error("Active publish branch already exists for project")
    }

    if (args.deactivateBranchId) {
      if (!existingActiveBranch || existingActiveBranch._id !== args.deactivateBranchId) {
        throw new Error("Active publish branch already exists for project")
      }

      await ctx.db.patch(args.deactivateBranchId, {
        status: "inactive",
        updatedAt: Date.now(),
      })
    }

    const now = Date.now()
    return await ctx.db.insert("publishBranches", {
      projectId: args.projectId,
      branchName: args.branchName,
      baseBranch: args.baseBranch,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
  },
})

/** Update a publish branch after a commit or PR creation. */
export const updateAfterCommit = mutation({
  args: {
    id: v.id("publishBranches"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    lastCommitSha: v.optional(v.string()),
    newFilePaths: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const publishBranch = await ctx.db.get(args.id)
    if (!publishBranch) throw new Error("Publish branch not found")
    await resolveProjectAccess(
      ctx,
      { projectId: publishBranch.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )

    const { id, userId: _userId, projectAccessToken: _pat, newFilePaths, ...updates } = args
    // Remove undefined keys so we only patch provided values
    const patches: Record<string, unknown> = { updatedAt: Date.now() }
    if (updates.prNumber !== undefined) patches.prNumber = updates.prNumber
    if (updates.prUrl !== undefined) patches.prUrl = updates.prUrl
    if (updates.lastCommitSha !== undefined) patches.lastCommitSha = updates.lastCommitSha

    // Merge new file paths into existing committedFilePaths
    if (newFilePaths && newFilePaths.length > 0) {
      const existingPaths = publishBranch.committedFilePaths ?? []
      const merged = [...new Set([...existingPaths, ...newFilePaths])]
      patches.committedFilePaths = merged
    }

    await ctx.db.patch(id, patches)
  },
})

/**
 * Mark a publish branch as merged (PR was merged). This is the CLIENT
 * FALLBACK merge path (usePrStatusSync detects an externally merged PR);
 * the webhook path is githubWebhook.handlePRMerged. Both run the SAME
 * shared, idempotent merge finalization so the lane's spent rows are
 * cleared and its merged documents published no matter which path fires
 * first.
 */
export const markMerged = mutation({
  args: {
    id: v.id("publishBranches"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    mergeCommitSha: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    headRepoFullName: v.string(),
    headBranch: v.string(),
  },
  handler: async (ctx, args) => {
    const publishBranch = await ctx.db.get(args.id)
    if (!publishBranch) throw new Error("Publish branch not found")
    await resolveProjectAccess(
      ctx,
      { projectId: publishBranch.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )

    return await recordMergedLaneAuthority(ctx, publishBranch, args)
  },
})

/**
 * Mark a publish branch as closed (PR was closed without merging). This is
 * the CLIENT FALLBACK close path (usePrStatusSync detects an externally
 * closed PR); the webhook path is githubWebhook.handlePRClosed. Both must
 * invalidate the lane's synchronization state, or content published to the
 * dead lane stays excluded from listDirtyForProject/listPending with no way
 * to republish.
 */
export const markClosed = mutation({
  args: {
    id: v.id("publishBranches"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const publishBranch = await ctx.db.get(args.id)
    if (!publishBranch) throw new Error("Publish branch not found")
    await resolveProjectAccess(
      ctx,
      { projectId: publishBranch.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )

    await ctx.db.patch(args.id, {
      status: "closed",
      laneInvalidationPending: true,
      laneCleanupAction: "restore_legacy",
      updatedAt: Date.now(),
    })
    return await invalidateClosedLaneSync(ctx, {
      ...publishBranch,
      status: "closed",
      laneInvalidationPending: true,
      laneCleanupAction: "restore_legacy",
    })
  },
})

/**
 * Finish (or run) the synchronization cleanup for a finished lane. Used by
 * publish-attempt recovery after it resolves an attempt whose lane closed
 * or merged while the attempt was active (the event-time cleanup deferred
 * behind the attempt).
 *
 * The action defaults from the lane's status - closed lanes invalidate
 * (restore stranded work), merged lanes finalize (spend merged work).
 * Recovery passes action:"invalidate" explicitly for a merged lane whose
 * attempt commit provably did NOT merge: that commit's work never reached
 * the base branch, so it must be restored, not spent.
 */
export const finishLaneCleanup = mutation({
  args: {
    id: v.id("publishBranches"),
    action: v.optional(v.union(v.literal("invalidate"), v.literal("finalize"))),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const publishBranch = await ctx.db.get(args.id)
    if (!publishBranch) throw new Error("Publish branch not found")
    await resolveProjectAccess(
      ctx,
      { projectId: publishBranch.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    if (publishBranch.status !== "closed" && publishBranch.status !== "merged") {
      throw new Error("Lane cleanup only applies to closed or merged publish lanes")
    }
    if (!args.action) throw new Error("Legacy lane cleanup requires an explicit persisted action")
    const action = args.action
    return action === "invalidate"
      ? await invalidateClosedLaneSync(ctx, publishBranch)
      : await finalizeMergedLaneSync(ctx, publishBranch)
  },
})

/**
 * Scheduled continuation for bounded lane cleanup: re-runs the pass for a
 * lane whose previous pass hit the batch limit, until the lane drains and
 * the durable flag clears. Dispatches on the lane's status.
 */
export const continueLaneCleanup = internalMutation({
  args: { id: v.id("publishBranches") },
  handler: async (ctx, args) => {
    const publishBranch = await ctx.db.get(args.id)
    if (!publishBranch) return
    if (publishBranch.laneCleanupAction === "restore_legacy") {
      await invalidateClosedLaneSync(ctx, publishBranch)
    } else if (publishBranch.laneCleanupAction === "finalize_legacy") {
      await finalizeMergedLaneSync(ctx, publishBranch)
      await completeMergeVerificationIfIdle(ctx, publishBranch._id)
    }
  },
})

/** Demotes the current publish branch to inactive before creating a new current branch. */
export const deactivateCurrentForProject = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")

    const current = await ctx.db
      .query("publishBranches")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "active"))
      .first()

    if (!current) {
      return null
    }

    await ctx.db.patch(current._id, {
      status: "inactive",
      updatedAt: Date.now(),
    })

    return current._id
  },
})
