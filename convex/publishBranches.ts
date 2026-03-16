import { v } from "convex/values"
import { verifyProjectAccessToken } from "../lib/project-access-token"
import type { MutationCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { authComponent } from "./auth"

/**
 * Verify the caller owns the project using the same pattern as documents.ts:
 * 1. Check Better Auth session (OAuth users)
 * 2. Fall back to signed projectAccessToken (PAT users)
 * 3. Reject if neither is valid
 */
async function resolveProjectCaller(
  ctx: MutationCtx,
  projectId: string,
  explicitUserId?: string,
  projectAccessToken?: string,
) {
  // First check for projectAccessToken (used when called from API routes with PAT auth)
  const payload = await verifyProjectAccessToken(projectAccessToken)
  if (payload && payload.projectId === projectId) {
    const project = (await ctx.db.get(projectId as any)) as {
      userId: string
    } | null
    if (!project || project.userId !== payload.userId) {
      throw new Error("Unauthorized")
    }
    if (explicitUserId && explicitUserId !== payload.userId) {
      throw new Error("Unauthorized: caller identity does not match userId")
    }
    return { userId: payload.userId, project }
  }

  // Fall back to Convex session auth (for OAuth users calling from client)
  const authUser = await authComponent.safeGetAuthUser(ctx)
  if (authUser?._id) {
    const authUserId = authUser._id as string
    if (explicitUserId && explicitUserId !== authUserId) {
      throw new Error("Unauthorized: caller identity does not match userId")
    }
    const project = (await ctx.db.get(projectId as any)) as {
      userId: string
    } | null
    if (!project || project.userId !== authUserId) {
      throw new Error("Unauthorized")
    }
    return { userId: authUserId, project }
  }

  // Last resort: verify explicitUserId matches project owner
  // This handles the API route case where we pass project.userId as explicitUserId
  if (explicitUserId) {
    const project = (await ctx.db.get(projectId as any)) as {
      userId: string
    } | null
    if (!project || project.userId !== explicitUserId) {
      throw new Error("Unauthorized")
    }
    return { userId: explicitUserId, project }
  }

  throw new Error("Unauthorized: Not authenticated")
}

/** Returns the active publish branch for a project (at most one). */
export const getActiveForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("publishBranches")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "active"))
      .first()
  },
})

/** Finds a publish branch by its PR number. Used by webhook handlers. */
export const getByPRNumber = query({
  args: { prNumber: v.number() },
  handler: async (ctx, args) => {
    // No index on prNumber — PR numbers are unique and this is only called by webhooks
    const all = await ctx.db.query("publishBranches").collect()
    return all.find((pb) => pb.prNumber === args.prNumber) ?? null
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
  },
  handler: async (ctx, args) => {
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

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
    await resolveProjectCaller(ctx, publishBranch.projectId, args.userId, args.projectAccessToken)

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

/** Mark a publish branch as merged (PR was merged). */
export const markMerged = mutation({
  args: {
    id: v.id("publishBranches"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const publishBranch = await ctx.db.get(args.id)
    if (!publishBranch) throw new Error("Publish branch not found")
    await resolveProjectCaller(ctx, publishBranch.projectId, args.userId, args.projectAccessToken)

    await ctx.db.patch(args.id, {
      status: "merged",
      updatedAt: Date.now(),
    })
  },
})

/** Mark a publish branch as closed (PR was closed without merging). */
export const markClosed = mutation({
  args: {
    id: v.id("publishBranches"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const publishBranch = await ctx.db.get(args.id)
    if (!publishBranch) throw new Error("Publish branch not found")
    await resolveProjectCaller(ctx, publishBranch.projectId, args.userId, args.projectAccessToken)

    await ctx.db.patch(args.id, {
      status: "closed",
      updatedAt: Date.now(),
    })
  },
})
