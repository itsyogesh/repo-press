import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"

/**
 * Validates webhook URL for safety.
 * Rejects localhost, private IP ranges, and non-HTTPS URLs.
 */
function validateWebhookUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("Invalid webhook URL format")
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS")
  }

  const hostname = parsed.hostname.toLowerCase()

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    throw new Error("Webhook URL cannot point to localhost")
  }

  const privatePatterns = [
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^169\.254\./, // Link-local
    /^0\./, // 0.0.0.0/8
  ]

  if (privatePatterns.some((pattern) => pattern.test(hostname))) {
    throw new Error("Webhook URL cannot point to private network addresses")
  }

  const blockedHostnames = ["metadata.google.internal", "169.254.169.254"]
  if (blockedHostnames.includes(hostname)) {
    throw new Error("Webhook URL cannot point to internal services")
  }
}

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
    validateWebhookUrl(args.url)

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

    await resolveProjectAccess(
      ctx,
      { projectId: record.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "owner",
    )

    if (args.url) {
      validateWebhookUrl(args.url)
    }

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

    await resolveProjectAccess(
      ctx,
      { projectId: record.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "owner",
    )

    await ctx.db.delete(args.id)
  },
})
