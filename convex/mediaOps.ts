import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"

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
    const { userId } = await resolveProjectAccess(ctx, args, "editor")

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
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    for (const id of args.ids) {
      const op = await ctx.db.get(id)
      if (!op || op.status !== "pending") continue

      await resolveProjectAccess(ctx, { projectId: op.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken }, "editor")

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
    await resolveProjectAccess(ctx, args, "editor")

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
