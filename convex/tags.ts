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
      .query("tags")
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
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

    const { userId: _userId, projectAccessToken: _pat, ...data } = args
    return await ctx.db.insert("tags", { ...data, createdAt: Date.now() })
  },
})

export const remove = mutation({
  args: {
    id: v.id("tags"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.id)
    if (!tag) throw new Error("Tag not found")
    await resolveProjectCaller(ctx, tag.projectId, args.userId, args.projectAccessToken)

    await ctx.db.delete(args.id)
  },
})
