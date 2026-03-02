import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { authComponent } from "./auth"

export const listByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
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
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20

    return await ctx.db
      .query("documentHistory")
      .withIndex("by_documentId_createdAt", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit })
  },
})

export const getVersionCount = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
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
  },
  handler: async (ctx, args) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser) {
      throw new Error("Unauthorized: Not authenticated")
    }
    const userId = authUser._id as string

    const historyEntry = await ctx.db.get(args.historyId)
    if (!historyEntry) {
      throw new Error("History entry not found")
    }

    const document = await ctx.db.get(historyEntry.documentId)
    if (!document) {
      throw new Error("Document not found")
    }

    const project = await ctx.db.get(document.projectId)
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized")
    }

    const now = Date.now()

    // Insert a new history entry representing the restored content
    await ctx.db.insert("documentHistory", {
      documentId: document._id,
      body: historyEntry.body,
      frontmatter: historyEntry.frontmatter,
      editedBy: userId,
      message: `Restored to version from ${new Date(historyEntry.createdAt).toISOString()}`,
      changeType: "patch",
      createdAt: now,
    })

    await ctx.db.patch(document._id, {
      body: historyEntry.body,
      frontmatter: historyEntry.frontmatter,
      updatedAt: now,
    })

    return document._id
  },
})
