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
      .query("webhooks")
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
    url: v.string(),
    secret: v.optional(v.string()),
    events: v.array(
      v.union(
        v.literal("document.published"),
        v.literal("document.updated"),
        v.literal("document.deleted"),
        v.literal("document.status_changed"),
        v.literal("project.updated"),
      ),
    ),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "owner")

    const { userId: _u, projectAccessToken: _pat, ...data } = args
    const now = Date.now()
    return await ctx.db.insert("webhooks", { ...data, createdAt: now, updatedAt: now })
  },
})

export const update = mutation({
  args: {
    id: v.id("webhooks"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    secret: v.optional(v.string()),
    events: v.optional(
      v.array(
        v.union(
          v.literal("document.published"),
          v.literal("document.updated"),
          v.literal("document.deleted"),
          v.literal("document.status_changed"),
          v.literal("project.updated"),
        ),
      ),
    ),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id)
    if (!record) throw new Error("Webhook not found")

    await resolveProjectAccess(ctx, { projectId: record.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken }, "owner")

    const { id, userId: _u, projectAccessToken: _pat, ...updates } = args
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() })
  },
})

export const remove = mutation({
  args: {
    id: v.id("webhooks"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id)
    if (!record) throw new Error("Webhook not found")

    await resolveProjectAccess(ctx, { projectId: record.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken }, "owner")

    await ctx.db.delete(args.id)
  },
})
