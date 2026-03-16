import { v } from "convex/values"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { resolveProjectCaller } from "./project_auth"

/** Returns the active publish branch for a project (at most one). */
export const getActiveForProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

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
