import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
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
    const now = Date.now()
    return await ctx.db.insert("mediaAssets", { ...args, createdAt: now, updatedAt: now })
  },
})

export const remove = mutation({
  args: { id: v.id("mediaAssets") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
