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
      .query("categories")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect()
  },
})

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    parentId: v.optional(v.id("categories")),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

    const { userId: _userId, projectAccessToken: _pat, ...data } = args
    return await ctx.db.insert("categories", {
      ...data,
      createdAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: {
    id: v.id("categories"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id)
    if (!category) throw new Error("Category not found")
    await resolveProjectCaller(ctx, category.projectId, args.userId, args.projectAccessToken)

    await ctx.db.delete(args.id)
  },
})
