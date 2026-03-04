import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"

async function requireProjectOwnership(ctx: MutationCtx, projectId: Id<"projects">, userId: string) {
  const project = await ctx.db.get(projectId)
  if (!project || project.userId !== userId) {
    throw new Error("Unauthorized")
  }
}

export const stage = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.string(),
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
    await requireProjectOwnership(ctx, args.projectId, args.userId)

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

    return await ctx.db.insert("mediaOps", {
      ...args,
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
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    for (const id of args.ids) {
      const op = await ctx.db.get(id)
      if (!op || op.status !== "pending") continue

      // Fix #4: Verify ownership before marking as committed
      await requireProjectOwnership(ctx, op.projectId, args.userId)

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
    userId: v.string(),
    repoPath: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectOwnership(ctx, args.projectId, args.userId)

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
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Fix #4: Verify ownership before clearing committed records
    await requireProjectOwnership(ctx, args.projectId, args.userId)

    const committed = await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "committed"))
      .collect()

    for (const op of committed) {
      await ctx.db.delete(op._id)
    }
  },
})
