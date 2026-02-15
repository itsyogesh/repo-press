import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect()
  },
})

export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const getByRepo = query({
  args: {
    userId: v.id("users"),
    repoOwner: v.string(),
    repoName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_userId_repo", (q) =>
        q.eq("userId", args.userId).eq("repoOwner", args.repoOwner).eq("repoName", args.repoName),
      )
      .collect()
  },
})

export const create = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    repoOwner: v.string(),
    repoName: v.string(),
    branch: v.string(),
    contentRoot: v.string(),
    detectedFramework: v.optional(
      v.union(
        v.literal("fumadocs"),
        v.literal("nextra"),
        v.literal("astro"),
        v.literal("hugo"),
        v.literal("docusaurus"),
        v.literal("jekyll"),
        v.literal("contentlayer"),
        v.literal("next-mdx"),
        v.literal("custom"),
      ),
    ),
    contentType: v.union(
      v.literal("blog"),
      v.literal("docs"),
      v.literal("pages"),
      v.literal("changelog"),
      v.literal("custom"),
    ),
    frontmatterSchema: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    return await ctx.db.insert("projects", {
      ...args,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    branch: v.optional(v.string()),
    contentRoot: v.optional(v.string()),
    detectedFramework: v.optional(
      v.union(
        v.literal("fumadocs"),
        v.literal("nextra"),
        v.literal("astro"),
        v.literal("hugo"),
        v.literal("docusaurus"),
        v.literal("jekyll"),
        v.literal("contentlayer"),
        v.literal("next-mdx"),
        v.literal("custom"),
      ),
    ),
    contentType: v.optional(
      v.union(
        v.literal("blog"),
        v.literal("docs"),
        v.literal("pages"),
        v.literal("changelog"),
        v.literal("custom"),
      ),
    ),
    frontmatterSchema: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
