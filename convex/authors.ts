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
      .query("authors")
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
    email: v.optional(v.string()),
    avatar: v.optional(v.string()),
    bio: v.optional(v.string()),
    url: v.optional(v.string()),
    githubUsername: v.optional(v.string()),
    twitterHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")

    const { userId: _u, projectAccessToken: _pat, ...data } = args
    const now = Date.now()
    return await ctx.db.insert("authors", { ...data, createdAt: now, updatedAt: now })
  },
})

export const update = mutation({
  args: {
    id: v.id("authors"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    email: v.optional(v.string()),
    avatar: v.optional(v.string()),
    bio: v.optional(v.string()),
    url: v.optional(v.string()),
    githubUsername: v.optional(v.string()),
    twitterHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id)
    if (!record) throw new Error("Author not found")

    await resolveProjectAccess(ctx, { projectId: record.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken }, "editor")

    const { id, userId: _u, projectAccessToken: _pat, ...updates } = args
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() })
  },
})

export const remove = mutation({
  args: {
    id: v.id("authors"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id)
    if (!record) throw new Error("Author not found")

    await resolveProjectAccess(ctx, { projectId: record.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken }, "editor")

    await ctx.db.delete(args.id)
  },
})
