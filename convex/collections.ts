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
      .query("collections")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect()
  },
})

export const get = query({
  args: {
    id: v.id("collections"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const collection = await ctx.db.get(args.id)
    if (!collection) return null
    await resolveProjectCaller(ctx, collection.projectId, args.userId, args.projectAccessToken)
    return collection
  },
})

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    folderPath: v.string(),
    fieldSchema: v.optional(v.any()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

    const now = Date.now()
    const { userId: _userId, projectAccessToken: _pat, ...data } = args
    return await ctx.db.insert("collections", {
      ...data,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("collections"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    folderPath: v.optional(v.string()),
    fieldSchema: v.optional(v.any()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const collection = await ctx.db.get(args.id)
    if (!collection) throw new Error("Collection not found")
    await resolveProjectCaller(ctx, collection.projectId, args.userId, args.projectAccessToken)

    const { id, userId: _userId, projectAccessToken: _pat, ...updates } = args
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() })
  },
})

export const remove = mutation({
  args: {
    id: v.id("collections"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const collection = await ctx.db.get(args.id)
    if (!collection) throw new Error("Collection not found")
    await resolveProjectCaller(ctx, collection.projectId, args.userId, args.projectAccessToken)

    await ctx.db.delete(args.id)
  },
})
