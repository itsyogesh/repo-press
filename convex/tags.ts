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
    await resolveProjectAccess(ctx, args, "editor")

    const { userId: _u, projectAccessToken: _pat, ...data } = args
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
    const record = await ctx.db.get(args.id)
    if (!record) throw new Error("Tag not found")

    await resolveProjectAccess(ctx, { projectId: record.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken }, "editor")

    await ctx.db.delete(args.id)
  },
})
