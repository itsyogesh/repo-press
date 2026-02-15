import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("webhooks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect()
  },
})

export const create = mutation({
  args: {
    projectId: v.id("projects"),
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
    const now = Date.now()
    return await ctx.db.insert("webhooks", { ...args, createdAt: now, updatedAt: now })
  },
})

export const update = mutation({
  args: {
    id: v.id("webhooks"),
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
    const { id, ...updates } = args
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() })
  },
})

export const remove = mutation({
  args: { id: v.id("webhooks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
