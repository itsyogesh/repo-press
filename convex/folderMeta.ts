import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("folderMeta")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect()
  },
})

export const getByPath = query({
  args: {
    projectId: v.id("projects"),
    folderPath: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("folderMeta")
      .withIndex("by_projectId_folderPath", (q) => q.eq("projectId", args.projectId).eq("folderPath", args.folderPath))
      .first()
  },
})

export const upsert = mutation({
  args: {
    projectId: v.id("projects"),
    folderPath: v.string(),
    title: v.optional(v.string()),
    icon: v.optional(v.string()),
    defaultOpen: v.optional(v.boolean()),
    root: v.optional(v.boolean()),
    pageOrder: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("folderMeta")
      .withIndex("by_projectId_folderPath", (q) => q.eq("projectId", args.projectId).eq("folderPath", args.folderPath))
      .first()

    const now = Date.now()
    if (existing) {
      const { projectId, folderPath, ...updates } = args
      await ctx.db.patch(existing._id, { ...updates, updatedAt: now })
      return existing._id
    }
    return await ctx.db.insert("folderMeta", { ...args, createdAt: now, updatedAt: now })
  },
})

export const remove = mutation({
  args: { id: v.id("folderMeta") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
