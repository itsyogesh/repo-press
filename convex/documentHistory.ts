import { v } from "convex/values"
import { verifyProjectAccessToken } from "../lib/project-access-token"
import type { MutationCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { authComponent } from "./auth"
import { buildRestoreVersionMutation } from "./documentHistory-restore"

async function resolveProjectCaller(
  ctx: MutationCtx,
  projectId: string,
  explicitUserId?: string,
  projectAccessToken?: string,
) {
  const authUser = await authComponent.safeGetAuthUser(ctx)
  if (authUser?._id) {
    const authUserId = authUser._id as string
    if (explicitUserId && explicitUserId !== authUserId) {
      throw new Error("Unauthorized: caller identity does not match userId")
    }
    const project = (await ctx.db.get(projectId as any)) as { userId: string } | null
    if (!project || project.userId !== authUserId) {
      throw new Error("Unauthorized")
    }
    return { userId: authUserId, project }
  }

  const payload = await verifyProjectAccessToken(projectAccessToken)
  if (payload && payload.projectId === projectId) {
    const project = (await ctx.db.get(projectId as any)) as { userId: string } | null
    if (!project || project.userId !== payload.userId) {
      throw new Error("Unauthorized")
    }
    if (explicitUserId && explicitUserId !== payload.userId) {
      throw new Error("Unauthorized: caller identity does not match userId")
    }
    return { userId: payload.userId, project }
  }

  throw new Error("Unauthorized: Not authenticated")
}

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
