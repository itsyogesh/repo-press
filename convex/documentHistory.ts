import { v } from "convex/values"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { buildRestoreVersionMutation } from "./documentHistory_restore"
import { resolveProjectCaller } from "./project_auth"

async function requireDocumentOwnership(
  ctx: QueryCtx,
  documentId: string,
  userId?: string,
  projectAccessToken?: string,
) {
  const doc = (await ctx.db.get(documentId as any)) as {
    projectId: string
  } | null
  if (!doc) throw new Error("Document not found")
  return await resolveProjectCaller(ctx, doc.projectId, userId, projectAccessToken)
}

export const listByDocument = query({
  args: {
    documentId: v.id("documents"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireDocumentOwnership(ctx, args.documentId, args.userId, args.projectAccessToken)

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
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireDocumentOwnership(ctx, args.documentId, args.userId, args.projectAccessToken)

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
    await requireDocumentOwnership(ctx, args.documentId, args.userId, args.projectAccessToken)

    const history = await ctx.db
      .query("documentHistory")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect()
    return history.length
  },
})

export const get = query({
  args: { id: v.id("documentHistory") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
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

    const { userId } = await resolveProjectCaller(ctx, document.projectId, args.userId, args.projectAccessToken)

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
