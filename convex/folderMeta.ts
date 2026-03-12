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
      .query("folderMeta")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect()
  },
})

export const getByPath = query({
  args: {
    projectId: v.id("projects"),
    folderPath: v.string(),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return null

    return await ctx.db
      .query("folderMeta")
      .withIndex("by_projectId_folderPath", (q) => q.eq("projectId", args.projectId).eq("folderPath", args.folderPath))
      .first()
  },
})

export const upsert = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    folderPath: v.string(),
    title: v.optional(v.string()),
    icon: v.optional(v.string()),
    defaultOpen: v.optional(v.boolean()),
    root: v.optional(v.boolean()),
    pageOrder: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")

    const existing = await ctx.db
      .query("folderMeta")
      .withIndex("by_projectId_folderPath", (q) => q.eq("projectId", args.projectId).eq("folderPath", args.folderPath))
      .first()

    const now = Date.now()
    const { userId: _u, projectAccessToken: _pat, ...data } = args
    if (existing) {
      const { projectId: _p, folderPath: _f, ...updates } = data
      await ctx.db.patch(existing._id, { ...updates, updatedAt: now })
      return existing._id
    }
    return await ctx.db.insert("folderMeta", { ...data, createdAt: now, updatedAt: now })
  },
})

export const remove = mutation({
  args: {
    id: v.id("folderMeta"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id)
    if (!record) throw new Error("FolderMeta not found")

    await resolveProjectAccess(ctx, { projectId: record.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken }, "editor")

    await ctx.db.delete(args.id)
  },
})
