import { v } from "convex/values"
import { verifyProjectAccessToken } from "../lib/project-access-token"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { authComponent } from "./auth"

async function requireProjectOwnership(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  userId?: string,
  projectAccessToken?: string,
) {
  const authUser = await authComponent.safeGetAuthUser(ctx)
  const authUserId = authUser?._id ? (authUser._id as string) : null
  if (authUserId) {
    if (userId && authUserId !== userId) {
      throw new Error("Unauthorized: Not authenticated or identity mismatch")
    }
    const project = await ctx.db.get(projectId)
    if (!project || project.userId !== authUserId) {
      throw new Error("Unauthorized")
    }
    return authUserId
  }

  const payload = await verifyProjectAccessToken(projectAccessToken)
  if (payload && payload.projectId === projectId) {
    const project = await ctx.db.get(projectId)
    if (!project || project.userId !== payload.userId) {
      throw new Error("Unauthorized")
    }
    if (userId && payload.userId !== userId) {
      throw new Error("Unauthorized: Not authenticated or identity mismatch")
    }
    return payload.userId
  }

  throw new Error("Unauthorized")
}

export const stage = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    repoPath: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.optional(v.number()),
    sourceType: v.union(v.literal("blob"), v.literal("githubBranch")),
    blobUrl: v.optional(v.string()),
    blobAccess: v.optional(v.union(v.literal("public"), v.literal("private"))),
    githubBranch: v.optional(v.string()),
    githubPath: v.optional(v.string()),
    githubSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwnership(ctx, args.projectId, args.userId, args.projectAccessToken)

    const now = Date.now()
    const existingPending = await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_repoPath", (q) => q.eq("projectId", args.projectId).eq("repoPath", args.repoPath))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first()

    if (existingPending) {
      await ctx.db.patch(existingPending._id, {
        fileName: args.fileName,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        sourceType: args.sourceType,
        blobUrl: args.blobUrl,
        blobAccess: args.blobAccess,
        githubBranch: args.githubBranch,
        githubPath: args.githubPath,
        githubSha: args.githubSha,
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
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
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
  },
  handler: async (ctx, args) => {
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
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    for (const id of args.ids) {
      const op = await ctx.db.get(id)
      if (!op || op.status !== "pending") continue

      await requireProjectOwnership(ctx, op.projectId, args.userId, args.projectAccessToken)

      await ctx.db.patch(id, {
        status: "committed",
        commitSha: args.commitSha,
        updatedAt: now,
      })
    }
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
    await requireProjectOwnership(ctx, args.projectId, args.userId, args.projectAccessToken)

    const pending = await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_repoPath", (q) => q.eq("projectId", args.projectId).eq("repoPath", args.repoPath))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first()

    if (!pending) return null

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
    await requireProjectOwnership(ctx, args.projectId, args.userId, args.projectAccessToken)

    const committed = await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "committed"))
      .collect()

    for (const op of committed) {
      await ctx.db.delete(op._id)
    }
  },
})
