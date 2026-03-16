import { v } from "convex/values"
import { action, internalMutation, mutation, query } from "./_generated/server"
import { api, internal } from "./_generated/api"
import { resolveProjectCaller } from "./project_auth"

export const listByProject = query({
...
    await ctx.db.delete(args.id)
  },
})

/**
 * Internal mutation to record a webhook trigger.
 */
export const markTriggered = internalMutation({
  args: { id: v.id("webhooks") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastTriggeredAt: Date.now() })
  },
})

/**
 * Action to trigger webhooks for a project event.
 */
export const triggerWebhooks = action({
  args: {
    projectId: v.id("projects"),
    event: v.union(
      v.literal("document.published"),
      v.literal("document.updated"),
      v.literal("document.deleted"),
      v.literal("document.status_changed"),
      v.literal("project.updated"),
    ),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    // 1. Fetch active webhooks for this project and event
    const allWebhooks = await ctx.runQuery(api.webhooks.listByProject, {
      projectId: args.projectId,
    })

    const activeWebhooks = allWebhooks.filter((w) => w.isActive && w.events.includes(args.event))

    if (activeWebhooks.length === 0) return

    // 2. Trigger each webhook
    await Promise.all(
      activeWebhooks.map(async (webhook) => {
        try {
          const body = JSON.stringify({
            event: args.event,
            timestamp: Date.now(),
            projectId: args.projectId,
            data: args.payload,
          })

          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": "RepoPress-Webhooks/1.0",
          }

          // TODO: Add HMAC signature if secret is present
          // This requires a shared helper for signing (same as project tokens)

          const response = await fetch(webhook.url, {
            method: "POST",
            headers,
            body,
          })

          if (response.ok) {
            await ctx.runMutation(internal.webhooks.markTriggered, { id: webhook._id })
          }
        } catch (error) {
          console.error(`Failed to trigger webhook ${webhook._id}:`, error)
        }
      }),
    )
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
