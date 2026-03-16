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
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

    const now = Date.now()
    const { userId: _userId, projectAccessToken: _pat, ...data } = args
    return await ctx.db.insert("authors", {
      ...data,
      createdAt: now,
      updatedAt: now,
    })
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
    const author = await ctx.db.get(args.id)
    if (!author) throw new Error("Author not found")
    await resolveProjectCaller(ctx, author.projectId, args.userId, args.projectAccessToken)

    const { id, userId: _userId, projectAccessToken: _pat, ...updates } = args
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
    const author = await ctx.db.get(args.id)
    if (!author) throw new Error("Author not found")
    await resolveProjectCaller(ctx, author.projectId, args.userId, args.projectAccessToken)

    await ctx.db.delete(args.id)
  },
})
