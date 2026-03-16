import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return []

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
    await resolveProjectAccess(ctx, args, "editor")

    const { userId: _u, projectAccessToken: _pat, ...data } = args
    const now = Date.now()
    return await ctx.db.insert("mediaAssets", { ...data, createdAt: now, updatedAt: now })
  },
})

export const remove = mutation({
  args: {
    id: v.id("mediaAssets"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id)
    if (!record) throw new Error("MediaAsset not found")

    await resolveProjectAccess(ctx, { projectId: record.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken }, "editor")

    await ctx.db.delete(args.id)
  },
})
