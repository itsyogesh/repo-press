import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { resolveProjectCaller } from "./project_auth"

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

    return await ctx.db
      .query("mediaAssets")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect()
  },
})

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    fileName: v.string(),
    filePath: v.string(),
    mimeType: v.optional(v.string()),
    altText: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    sizeBytes: v.optional(v.number()),
    githubSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

    const now = Date.now()
    const { userId: _u, projectAccessToken: _p, ...data } = args
    return await ctx.db.insert("mediaAssets", {
      ...data,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("mediaAssets"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    altText: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.id)
    if (!asset) throw new Error("Media asset not found")
    await resolveProjectCaller(ctx, asset.projectId, args.userId, args.projectAccessToken)

    const { id, userId: _u, projectAccessToken: _p, ...updates } = args
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() })
  },
})

export const getByPath = query({
  args: {
    projectId: v.id("projects"),
    filePath: v.string(),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

    return await ctx.db
      .query("mediaAssets")
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
      .first()
  },
})

export const remove = mutation({
  args: {
    id: v.id("mediaAssets"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.id)
    if (!asset) throw new Error("Media asset not found")
    await resolveProjectCaller(ctx, asset.projectId, args.userId, args.projectAccessToken)

    await ctx.db.delete(args.id)
  },
})
