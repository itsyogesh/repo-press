import { v } from "convex/values"
import { verifyServerQueryToken } from "../lib/project-access-token"
import type { Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"
import { internalMutation, mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"
import { invalidateClosedLaneSync } from "./lib/laneInvalidation"
import { finalizeMergedLaneSync } from "./lib/laneMerge"
import { completeCloseVerificationIfIdle, completeMergeVerificationIfIdle } from "./lib/publishAttemptCleanup"

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
 * Lane whose GitHub PR status should be synchronized. Unfinished verified
 * merge/close cleanup takes priority over open lanes so React reactivity
 * cannot cancel the retry loop; a legacy merged lane missing immutable
 * authority is also returned for authenticated backfill.
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
    const [pendingMerged, pendingClosed] = await Promise.all([
      ctx.db
        .query("publishBranches")
        .withIndex("by_project_merge_lastStatusCheckedAt", (q) =>
          q.eq("projectId", args.projectId).eq("mergeVerificationState", "pending"),
        )
        .order("asc")
        .first(),
      ctx.db
        .query("publishBranches")
        .withIndex("by_project_close_lastStatusCheckedAt", (q) =>
          q.eq("projectId", args.projectId).eq("closeVerificationState", "pending"),
        )
        .order("asc")
        .first(),
    ])
    const pendingLifecycle = [
      pendingMerged?.status === "merged" ? pendingMerged : null,
      pendingClosed?.status === "closed" ? pendingClosed : null,
    ]
      .filter((lane): lane is NonNullable<typeof lane> => Boolean(lane?.prNumber))
      .sort(
        (a, b) =>
          (a.lastStatusCheckedAt ?? 0) - (b.lastStatusCheckedAt ?? 0) ||
          a.createdAt - b.createdAt ||
          String(a._id).localeCompare(String(b._id)),
      )[0]
    if (pendingLifecycle) return pendingLifecycle
    const openCandidates = await Promise.all(
      (["active", "inactive"] as const).map(async (status) => {
        return await ctx.db
          .query("publishBranches")
          .withIndex("by_projectId_status_lastStatusCheckedAt_createdAt", (q) =>
            q.eq("projectId", args.projectId).eq("status", status),
          )
          .order("asc")
          .filter((q) => q.neq(q.field("prNumber"), undefined))
          .first()
      }),
    )
    const openCandidate = openCandidates
      .filter((lane): lane is NonNullable<typeof lane> => Boolean(lane?.prNumber))
      .sort(
        (a, b) =>
          (a.lastStatusCheckedAt ?? 0) - (b.lastStatusCheckedAt ?? 0) ||
          a.createdAt - b.createdAt ||
          String(a._id).localeCompare(String(b._id)),
      )[0]
    if (openCandidate) return openCandidate
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

/**
 * Record that the trusted lifecycle route is about to check this exact lane.
 * This fairness cursor is not evidence of any GitHub state.
 */
export const markStatusCheckAttempt = mutation({
  args: {
    id: v.id("publishBranches"),
    projectId: v.id("projects"),
    prNumber: v.number(),
    headBranch: v.string(),
    baseBranch: v.string(),
    serverQueryToken: v.string(),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(
      ctx,
      { projectId: args.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    if (!(await verifyServerQueryToken(args.serverQueryToken))) {
      throw new Error("Unauthorized: valid server proof is required to claim a lifecycle check")
    }
    const lane = await ctx.db.get(args.id)
    if (
      !lane ||
      lane.projectId !== args.projectId ||
      lane.prNumber !== args.prNumber ||
      lane.branchName !== args.headBranch ||
      lane.baseBranch !== args.baseBranch
    ) {
      throw new Error("Lifecycle check identity does not match the persisted publish lane")
    }
    await ctx.db.patch(lane._id, { lastStatusCheckedAt: Date.now() })
    return { claimed: true as const }
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
    const { project } = await resolveProjectAccess(ctx, args, "editor")

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
      repoOwner: project.repoOwner,
      repoName: project.repoName,
      repoOwnerKey: project.repoOwner.toLowerCase(),
      repoNameKey: project.repoName.toLowerCase(),
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
 * Internal legacy-residue dispatcher. The action is always read from the
 * lane's persisted state; no editor or caller can select finalization.
 */
export const finishLaneCleanup = internalMutation({
  args: { id: v.id("publishBranches") },
  handler: async (ctx, args) => {
    const publishBranch = await ctx.db.get(args.id)
    if (!publishBranch) throw new Error("Publish branch not found")
    if (publishBranch.status !== "closed" && publishBranch.status !== "merged") {
      throw new Error("Lane cleanup only applies to closed or merged publish lanes")
    }
    if (!publishBranch.laneCleanupAction) throw new Error("Legacy lane cleanup requires a persisted action")
    const result =
      publishBranch.laneCleanupAction === "restore_legacy"
        ? await invalidateClosedLaneSync(ctx, publishBranch)
        : await finalizeMergedLaneSync(ctx, publishBranch)
    if (publishBranch.status === "closed") await completeCloseVerificationIfIdle(ctx, publishBranch._id)
    return result
  },
})

/**
 * Scheduled continuation for bounded lane cleanup: re-runs the pass for a
 * lane whose previous pass hit the batch limit, until the lane drains and
 * the durable flag clears. Dispatches only the action already persisted on
 * the lane by a server-verified state transition.
 */
export const continueLaneCleanup = internalMutation({
  args: { id: v.id("publishBranches") },
  handler: async (ctx, args) => {
    const publishBranch = await ctx.db.get(args.id)
    if (!publishBranch) return
    if (publishBranch.laneCleanupAction === "restore_legacy") {
      await invalidateClosedLaneSync(ctx, publishBranch)
      await completeCloseVerificationIfIdle(ctx, publishBranch._id)
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
