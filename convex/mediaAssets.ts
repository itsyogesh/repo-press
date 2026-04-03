import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"

export const listByProjectPaginated = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    sectionSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return { page: [], isDone: true, continueCursor: "" }

    const numItems = Math.min(args.limit ?? 24, 100)
    const query = ctx.db
      .query("mediaAssets")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")

    if (!args.sectionSlug) {
      return await query.paginate({ cursor: args.cursor ?? null, numItems })
    }

    const slug = args.sectionSlug.toLowerCase()
    const page = []
    let cursor = args.cursor ?? null
    let isDone = false

    while (page.length < numItems && !isDone) {
      const result = await query.paginate({ cursor, numItems })
      page.push(...result.page.filter((item) => item.filePath.toLowerCase().includes(slug)))
      cursor = result.continueCursor
      isDone = result.isDone
    }

    return {
      page: page.slice(0, numItems),
      isDone,
      continueCursor: isDone ? "" : (cursor ?? ""),
    }
  },
})

export const updateAltText = mutation({
  args: {
    id: v.id("mediaAssets"),
    altText: v.string(),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id)
    if (!record) throw new Error("MediaAsset not found")

    await resolveProjectAccess(
      ctx,
      { projectId: record.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )

    await ctx.db.patch(args.id, { altText: args.altText, updatedAt: Date.now() })
  },
})

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
      .query("mediaAssets")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect()
  },
})

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    fileName: v.string(),
    filePath: v.string(),
    mimeType: v.optional(v.string()),
    altText: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    sizeBytes: v.optional(v.number()),
    githubSha: v.optional(v.string()),
    originalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")

    const { userId: _u, projectAccessToken: _pat, ...data } = args
    const now = Date.now()
    return await ctx.db.insert("mediaAssets", { ...data, createdAt: now, updatedAt: now })
  },
})

export const upsert = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    fileName: v.string(),
    filePath: v.string(),
    mimeType: v.optional(v.string()),
    altText: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    sizeBytes: v.optional(v.number()),
    githubSha: v.optional(v.string()),
    originalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")

    const { userId: _u, projectAccessToken: _pat, ...data } = args
    const now = Date.now()
    const existing = await ctx.db
      .query("mediaAssets")
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...data,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert("mediaAssets", {
      ...data,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const remove = mutation({
  args: {
    id: v.id("mediaAssets"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id)
    if (!record) throw new Error("MediaAsset not found")

    await resolveProjectAccess(
      ctx,
      { projectId: record.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )

    await ctx.db.delete(args.id)
  },
})
