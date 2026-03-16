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
    await resolveProjectCaller(ctx, args.projectId, args.userId, args.projectAccessToken)

    const now = Date.now()
    const { userId: _userId, projectAccessToken: _pat, ...data } = args
    return await ctx.db.insert("webhooks", {
      ...data,
      createdAt: now,
      updatedAt: now,
    })
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
    const webhook = await ctx.db.get(args.id)
    if (!webhook) throw new Error("Webhook not found")
    await resolveProjectCaller(ctx, webhook.projectId, args.userId, args.projectAccessToken)

    const { id, userId: _userId, projectAccessToken: _pat, ...updates } = args
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
    const webhook = await ctx.db.get(args.id)
    if (!webhook) throw new Error("Webhook not found")
    await resolveProjectCaller(ctx, webhook.projectId, args.userId, args.projectAccessToken)

    await ctx.db.delete(args.id)
  },
})
