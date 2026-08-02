import { v } from "convex/values"
import { resolveStoredRepoPath, type StoredPathRepresentation } from "../lib/preview/path-policy"
import type { Id } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"
import { isDocumentContentClean } from "./lib/documentCleanliness"
import { deleteOwnedMediaStorageOrKeepTombstone } from "./lib/mediaTombstone"
import { assertNoActivePublishAttempt } from "./lib/publishAttemptGuard"
import { requireCommittedAttempt, requireExplorerAssociation } from "./lib/publishAttemptOwnership"

/** Returns all pending explorer ops for a project. */
export const listPending = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return []

    return await ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "pending"))
      .collect()
  },
})

/** Returns the first explorer op matching project + filePath. */
export const getByFilePath = query({
  args: {
    projectId: v.id("projects"),
    filePath: v.string(),
    pathRepresentation: v.union(v.literal("legacy_repo_v0"), v.literal("content_relative_v1")),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return null

    const indexed = ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
    return await indexed
      .filter((q) =>
        args.pathRepresentation === "content_relative_v1"
          ? q.eq(q.field("pathRepresentation"), "content_relative_v1")
          : q.or(q.eq(q.field("pathRepresentation"), "legacy_repo_v0"), q.eq(q.field("pathRepresentation"), undefined)),
      )
      .first()
  },
})

/**
 * Stage a file creation in the explorer.
 * Creates (or resets) the associated document record and inserts a pending explorerOp.
 */
export const stageCreate = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    filePath: v.string(),
    pathRepresentation: v.literal("content_relative_v1"),
    title: v.string(),
    initialBody: v.optional(v.string()),
    initialFrontmatter: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { userId, project } = await resolveProjectAccess(ctx, args, "editor")

    // Check for existing pending op at this filePath
    const existingOp = await ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
      .filter((q) =>
        q.and(q.eq(q.field("pathRepresentation"), args.pathRepresentation), q.eq(q.field("status"), "pending")),
      )
      .first()
    if (existingOp) {
      throw new Error("File already staged for creation")
    }

    // Check for existing document at this filePath
    const existingDoc = await ctx.db
      .query("documents")
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
      .filter((q) => q.eq(q.field("pathRepresentation"), args.pathRepresentation))
      .first()

    const now = Date.now()

    if (existingDoc) {
      // Edge case #5: If published or archived, reset to draft
      if (existingDoc.status === "published" || existingDoc.status === "archived") {
        const writesContent = args.initialBody !== undefined || args.initialFrontmatter !== undefined
        await ctx.db.patch(existingDoc._id, {
          status: "draft",
          pathRepresentation: "content_relative_v1",
          githubSha: undefined,
          publishedAt: undefined,
          ...(args.title ? { title: args.title } : {}),
          ...(args.initialBody !== undefined ? { body: args.initialBody } : {}),
          ...(args.initialFrontmatter !== undefined ? { frontmatter: args.initialFrontmatter } : {}),
          ...(writesContent ? { contentVersion: (existingDoc.contentVersion ?? 0) + 1 } : {}),
          updatedAt: now,
        })
      } else {
        // Edge case #7: Patch title/body if provided and they differ
        const patches: Record<string, unknown> = { updatedAt: now }
        if (args.title && args.title !== existingDoc.title) {
          patches.title = args.title
        }
        if (args.initialBody !== undefined && args.initialBody !== existingDoc.body) {
          patches.body = args.initialBody
          patches.contentVersion = (existingDoc.contentVersion ?? 0) + 1
        }
        if (args.initialFrontmatter !== undefined) {
          patches.frontmatter = args.initialFrontmatter
          patches.contentVersion = (existingDoc.contentVersion ?? 0) + 1
        }
        if (Object.keys(patches).length > 1) {
          // More than just updatedAt
          await ctx.db.patch(existingDoc._id, patches)
        }
      }
    } else {
      // Create a new document in draft status
      await ctx.db.insert("documents", {
        projectId: args.projectId,
        filePath: args.filePath,
        pathRepresentation: args.pathRepresentation,
        title: args.title,
        status: "draft",
        body: args.initialBody,
        frontmatter: args.initialFrontmatter,
        createdAt: now,
        updatedAt: now,
      })
    }

    // Insert the explorerOp
    const opId = await ctx.db.insert("explorerOps", {
      projectId: args.projectId,
      userId,
      opType: "create",
      filePath: args.filePath,
      pathRepresentation: args.pathRepresentation,
      repoPath: resolveStoredRepoPath(project.contentRoot ?? "", args.filePath, args.pathRepresentation),
      initialBody: args.initialBody,
      initialFrontmatter: args.initialFrontmatter,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })

    return opId
  },
})

/**
 * Stage a file deletion in the explorer.
 * Records the intent to delete; actual deletion happens on commit/publish.
 */
export const stageDelete = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    filePath: v.string(),
    pathRepresentation: v.literal("content_relative_v1"),
    previousSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, project } = await resolveProjectAccess(ctx, args, "editor")

    // Check for existing pending op at this path
    const existingOp = await ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
      .filter((q) =>
        q.and(q.eq(q.field("pathRepresentation"), args.pathRepresentation), q.eq(q.field("status"), "pending")),
      )
      .first()
    if (existingOp) {
      throw new Error("File already has a pending operation")
    }

    const now = Date.now()
    const opId = await ctx.db.insert("explorerOps", {
      projectId: args.projectId,
      userId,
      opType: "delete",
      filePath: args.filePath,
      pathRepresentation: args.pathRepresentation,
      repoPath: resolveStoredRepoPath(project.contentRoot ?? "", args.filePath, args.pathRepresentation),
      previousSha: args.previousSha,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })

    return opId
  },
})

/**
 * Undo a pending explorer op.
 * If the op was a "create", also removes the associated draft document.
 */
export const undoOp = mutation({
  args: {
    id: v.id("explorerOps"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.id)
    if (!op) throw new Error("Explorer op not found")
    if (op.status !== "pending") {
      throw new Error("Can only undo pending operations")
    }

    await resolveProjectAccess(
      ctx,
      { projectId: op.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )

    // A publish attempt that reached the commit boundary has (or is about to
    // have) a Git commit containing this op - undoing it now would silently
    // diverge Convex state from the repository.
    await assertNoActivePublishAttempt(ctx.db, op.projectId)

    // Mark the op as undone
    await ctx.db.patch(args.id, {
      status: "undone",
      updatedAt: Date.now(),
    })

    // If this was a create op, clean up the associated draft document
    if (op.opType === "create") {
      const doc = await ctx.db
        .query("documents")
        .withIndex("by_projectId_filePath", (q) => q.eq("projectId", op.projectId).eq("filePath", op.filePath))
        .filter((q) =>
          op.pathRepresentation === "content_relative_v1"
            ? q.eq(q.field("pathRepresentation"), "content_relative_v1")
            : q.or(
                q.eq(q.field("pathRepresentation"), "legacy_repo_v0"),
                q.eq(q.field("pathRepresentation"), undefined),
              ),
        )
        .first()
      if (doc && doc.status === "draft") {
        await ctx.db.delete(doc._id)
      }
    }
  },
})

/**
 * Discard all pending explorer ops and edited draft documents for a project.
 * Existing files keep their document record, but draft body/frontmatter are cleared
 * so the Studio reloads the canonical GitHub content.
 */
export const discardAll = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")

    // Refuse to discard while a publish attempt is at the commit boundary:
    // the Git commit may already contain this staged work.
    await assertNoActivePublishAttempt(ctx.db, args.projectId)

    const now = Date.now()
    const pendingOps = await ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "pending"))
      .collect()
    const pendingMediaOps = await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "pending"))
      .collect()

    const pendingCreateIdentities = new Set(
      pendingOps
        .filter((op) => op.opType === "create" && op.status === "pending")
        .map((op) => `${op.pathRepresentation ?? "legacy_repo_v0"}\0${op.filePath}`),
    )

    for (const op of pendingOps) {
      await ctx.db.patch(op._id, {
        status: "undone",
        updatedAt: now,
      })

      if (op.opType === "create") {
        const doc = await ctx.db
          .query("documents")
          .withIndex("by_projectId_filePath", (q) => q.eq("projectId", op.projectId).eq("filePath", op.filePath))
          .filter((q) =>
            op.pathRepresentation === "content_relative_v1"
              ? q.eq(q.field("pathRepresentation"), "content_relative_v1")
              : q.or(
                  q.eq(q.field("pathRepresentation"), "legacy_repo_v0"),
                  q.eq(q.field("pathRepresentation"), undefined),
                ),
          )
          .first()

        if (doc && doc.status === "draft") {
          await ctx.db.delete(doc._id)
        }
      }
    }

    for (const mediaOp of pendingMediaOps) {
      if (mediaOp.convexStorageId) {
        await deleteOwnedMediaStorageOrKeepTombstone(ctx, mediaOp)
        continue
      }
      await ctx.db.patch(mediaOp._id, {
        status: "undone",
        updatedAt: now,
      })
    }

    const draftDocs = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "draft"))
      .collect()
    const approvedDocs = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "approved"))
      .collect()

    const dirtyDocs = [...draftDocs, ...approvedDocs].filter(
      (doc) =>
        !pendingCreateIdentities.has(`${doc.pathRepresentation ?? "legacy_repo_v0"}\0${doc.filePath}`) &&
        (doc.body != null || doc.frontmatter != null) &&
        !isDocumentContentClean(doc),
    )

    for (const doc of dirtyDocs) {
      await ctx.db.patch(doc._id, {
        body: undefined,
        frontmatter: undefined,
        contentVersion: (doc.contentVersion ?? 0) + 1,
        updatedAt: now,
      })
    }

    return {
      discardedOpIds: pendingOps.map((op) => op._id),
      discardedMediaOpIds: pendingMediaOps.map((op) => op._id),
      discardedDirtyDocIds: dirtyDocs.map((doc) => doc._id),
      discardedDirtyPaths: dirtyDocs.map((doc) => doc.filePath),
      discardedCreatePaths: pendingOps.filter((op) => op.opType === "create").map((op) => op.filePath),
    }
  },
})

/**
 * Mark a batch of explorer ops as committed after a successful GitHub commit.
 */
export const markCommitted = mutation({
  args: {
    ids: v.array(v.id("explorerOps")),
    deleteAssociations: v.optional(
      v.array(
        v.object({
          opId: v.id("explorerOps"),
          documentId: v.id("documents"),
          expectedUpdatedAt: v.number(),
        }),
      ),
    ),
    commitSha: v.string(),
    publishBranchId: v.optional(v.id("publishBranches")),
    publishAttemptId: v.optional(v.id("publishAttempts")),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const deletedDocumentByOpId = new Map(
      (args.deleteAssociations ?? []).map((association) => [association.opId, association]),
    )
    // This mutation runs AFTER the lane commit has landed, so it must never
    // throw for a single bad association: throwing would roll back the whole
    // batch, leave every op "pending" against an already-published commit, and
    // make a retry re-commit committed work. Association-level problems are
    // reported while the op status still records reality. A valid delete does
    // NOT clear its document here: the lane can still close without merging,
    // so its recoverable draft bytes remain intact until immutable merge-tree
    // verification finalizes that exact attempt.
    const skippedDeleteAssociations: Array<{
      opId: (typeof args.ids)[number]
      documentId: Id<"documents">
      reason: "association-project-mismatch" | "association-path-mismatch" | "document-changed-after-snapshot"
    }> = []
    // Ops from the publish snapshot that can no longer be marked committed
    // even though the Git commit contains their changes (e.g. undone in a
    // race before the attempt guard existed). Reported so the caller can
    // surface the repository/draft divergence truthfully instead of
    // silently absorbing it. Already-committed ops are idempotent retries,
    // not drift.
    const unreconciledOpIds: Array<(typeof args.ids)[number]> = []
    for (const id of args.ids) {
      const op = await ctx.db.get(id)
      if (!op || op.status === "undone") {
        unreconciledOpIds.push(id)
      }
      // Only mark ops that are still pending (avoid overwriting concurrent
      // undos, and keep retries of this mutation idempotent)
      if (op && op.status === "pending") {
        const access = await resolveProjectAccess(
          ctx,
          { projectId: op.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
          "editor",
        )
        const repoPath =
          op.repoPath ??
          (typeof op.filePath === "string"
            ? resolveStoredRepoPath(
                access.project.contentRoot ?? "",
                op.filePath,
                op.pathRepresentation as StoredPathRepresentation | undefined,
              )
            : undefined)
        if (args.publishAttemptId !== undefined) {
          if (!repoPath) throw new Error("Publish attempt ownership mismatch: explorer path is missing")
          const publishAttempt = await requireCommittedAttempt(ctx.db, {
            attemptId: args.publishAttemptId,
            projectId: op.projectId,
            publishBranchId: args.publishBranchId,
            commitSha: args.commitSha,
          })
          requireExplorerAssociation(publishAttempt, {
            opId: id,
            repoPath,
            expectedUpdatedAt: op.updatedAt,
          })
        }

        const deleteAssociation = deletedDocumentByOpId.get(id)
        if (op.opType === "delete" && deleteAssociation) {
          const associatedDocument = await ctx.db.get(deleteAssociation.documentId)
          const skip = (reason: (typeof skippedDeleteAssociations)[number]["reason"]) => {
            skippedDeleteAssociations.push({ opId: id, documentId: deleteAssociation.documentId, reason })
          }
          if (!associatedDocument || associatedDocument.projectId !== op.projectId) {
            skip("association-project-mismatch")
          } else {
            const opRepoPath = resolveStoredRepoPath(
              access.project.contentRoot,
              op.filePath,
              op.pathRepresentation as StoredPathRepresentation | undefined,
            )
            const documentRepoPath = resolveStoredRepoPath(
              access.project.contentRoot,
              associatedDocument.filePath,
              associatedDocument.pathRepresentation as StoredPathRepresentation | undefined,
            )
            if (opRepoPath !== documentRepoPath) {
              skip("association-path-mismatch")
            } else if (associatedDocument.updatedAt !== deleteAssociation.expectedUpdatedAt) {
              skip("document-changed-after-snapshot")
            }
          }
        }

        await ctx.db.patch(id, {
          status: "committed",
          commitSha: args.commitSha,
          publishBranchId: args.publishBranchId,
          publishAttemptId: args.publishAttemptId,
          repoPath,
          updatedAt: now,
        })
      }
    }
    return { skippedDeleteAssociations, unreconciledOpIds }
  },
})
