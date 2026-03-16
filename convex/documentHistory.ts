import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { buildRestoreVersionMutation } from "./documentHistory_restore"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"

export const listByDocument = query({
  args: {
    documentId: v.id("documents"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return []

    const access = await resolveProjectReader(ctx, {
      projectId: doc.projectId,
      userId: args.userId,
      projectAccessToken: args.projectAccessToken,
    })
    if (!access) return []

    return await ctx.db
      .query("documentHistory")
      .withIndex("by_documentId_createdAt", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .collect()
  },
})

export const listByDocumentPaginated = query({
  args: {
    documentId: v.id("documents"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return { page: [], isDone: true, continueCursor: "" }

    const access = await resolveProjectReader(ctx, {
      projectId: doc.projectId,
      userId: args.userId,
      projectAccessToken: args.projectAccessToken,
    })
    if (!access) return { page: [], isDone: true, continueCursor: "" }

    const limit = args.limit ?? 20
    return await ctx.db
      .query("documentHistory")
      .withIndex("by_documentId_createdAt", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit })
  },
})

export const getVersionCount = query({
  args: {
    documentId: v.id("documents"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return 0

    const access = await resolveProjectReader(ctx, {
      projectId: doc.projectId,
      userId: args.userId,
      projectAccessToken: args.projectAccessToken,
    })
    if (!access) return 0

    const history = await ctx.db
      .query("documentHistory")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect()
    return history.length
  },
})

export const get = query({
  args: {
    id: v.id("documentHistory"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id)
    if (!entry) return null

    const doc = await ctx.db.get(entry.documentId)
    if (!doc) return null

    const access = await resolveProjectReader(ctx, {
      projectId: doc.projectId,
      userId: args.userId,
      projectAccessToken: args.projectAccessToken,
    })
    if (!access) return null

    return entry
  },
})

export const restoreVersion = mutation({
  args: {
    historyId: v.id("documentHistory"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const historyEntry = await ctx.db.get(args.historyId)
    if (!historyEntry) {
      throw new Error("History entry not found")
    }

    const document = await ctx.db.get(historyEntry.documentId)
    if (!document) {
      throw new Error("Document not found")
    }

    const { userId } = await resolveProjectAccess(ctx, { projectId: document.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken }, "editor")

    const now = Date.now()
    const restoreMutation = buildRestoreVersionMutation({
      documentId: document._id,
      currentBody: document.body ?? "",
      currentFrontmatter: document.frontmatter,
      targetBody: historyEntry.body,
      targetFrontmatter: historyEntry.frontmatter,
      editedBy: userId,
      historyCreatedAt: historyEntry.createdAt,
      now,
    })

    // Insert a new history entry representing the restored content
    await ctx.db.insert("documentHistory", restoreMutation.historyInsert)

    await ctx.db.patch(document._id, {
      ...restoreMutation.documentPatch,
      ...(document.status === "published" ? { status: "draft" as const } : {}),
    })

    return document._id
  },
})
