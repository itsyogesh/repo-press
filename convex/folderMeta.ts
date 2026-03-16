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
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

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
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

    const existing = await ctx.db
      .query("folderMeta")
      .withIndex("by_projectId_folderPath", (q) => q.eq("projectId", args.projectId).eq("folderPath", args.folderPath))
      .first()

    const now = Date.now()
    if (existing) {
      const { projectId: _p, folderPath: _f, userId: _u, projectAccessToken: _pat, ...updates } = args
      await ctx.db.patch(existing._id, { ...updates, updatedAt: now })
      return existing._id
    }
    const { userId: _u, projectAccessToken: _pat, ...data } = args
    return await ctx.db.insert("folderMeta", {
      ...data,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const remove = mutation({
  args: {
    id: v.id("folderMeta"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const meta = await ctx.db.get(args.id)
    if (!meta) throw new Error("Folder meta not found")
    await resolveProjectCaller(ctx, meta.projectId, args.userId, args.projectAccessToken)

    await ctx.db.delete(args.id)
  },
})
