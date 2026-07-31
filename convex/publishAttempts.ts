import { v } from "convex/values"
import { resolveStoredRepoPath, type StoredPathRepresentation } from "../lib/preview/path-policy"
import { mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"
import { findActivePublishAttempt } from "./lib/publishAttemptGuard"

const MAX_ATTEMPT_OPERATIONS = 500
const MAX_ATTEMPT_PATH_LENGTH = 512
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^[0-9a-f]{64}$/

const operationDescriptorValidator = v.union(
  v.object({ path: v.string(), action: v.literal("delete") }),
  v.object({
    path: v.string(),
    action: v.union(v.literal("create"), v.literal("update")),
    expectedBlobSha: v.string(),
  }),
)

function assertCanonicalOperationPath(path: string) {
  if (
    path.length === 0 ||
    path.length > MAX_ATTEMPT_PATH_LENGTH ||
    path !== path.normalize("NFC") ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("Publish attempt operation path must be canonical")
  }
}

const deleteAssociationValidator = v.object({
  opId: v.id("explorerOps"),
  documentId: v.id("documents"),
  expectedUpdatedAt: v.number(),
})

/**
 * The publish attempt that has crossed (or is crossing) the commit boundary
 * for a project, if any. Used by the publish route to recover a crashed
 * attempt before starting a new one.
 */
export const getActiveForProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return null
    return await findActivePublishAttempt(ctx.db, args.projectId)
  },
})

/**
 * Record a publish attempt just before the CAS commit. Refuses while another
 * attempt is still active - the route must recover or supersede it first.
 */
export const begin = mutation({
  args: {
    projectId: v.id("projects"),
    publishBranchId: v.id("publishBranches"),
    branchName: v.string(),
    expectedHeadSha: v.string(),
    planDigest: v.string(),
    operationDescriptors: v.array(operationDescriptorValidator),
    opIds: v.array(v.id("explorerOps")),
    mediaAssociations: v.array(
      v.object({
        mediaOpId: v.id("mediaOps"),
        repoPath: v.string(),
        expectedUpdatedAt: v.number(),
      }),
    ),
    documentAssociations: v.array(
      v.object({
        documentId: v.id("documents"),
        repoPath: v.string(),
        expectedUpdatedAt: v.number(),
        contentRevision: v.optional(v.string()),
        contentVersion: v.optional(v.number()),
      }),
    ),
    deleteAssociations: v.array(deleteAssociationValidator),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectAccess(
      ctx,
      { projectId: args.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    const active = await findActivePublishAttempt(ctx.db, args.projectId)
    if (active) {
      throw new Error("Another publish attempt is still active for this project")
    }

    // ── Shape bounds and duplicate rejection ──
    if (!SHA_PATTERN.test(args.expectedHeadSha)) throw new Error("Publish attempt expected head must be a 40-hex SHA")
    if (!DIGEST_PATTERN.test(args.planDigest)) throw new Error("Publish attempt plan digest must be a 64-hex digest")
    if (!args.branchName.startsWith("repopress/") || args.branchName.startsWith("repopress/install/")) {
      throw new Error("Publish attempt branch must be a repopress/ publish lane")
    }
    if (args.operationDescriptors.length === 0) {
      throw new Error("Publish attempt requires at least one operation descriptor")
    }
    if (
      args.opIds.length > MAX_ATTEMPT_OPERATIONS ||
      args.mediaAssociations.length > MAX_ATTEMPT_OPERATIONS ||
      args.documentAssociations.length > MAX_ATTEMPT_OPERATIONS ||
      args.deleteAssociations.length > MAX_ATTEMPT_OPERATIONS ||
      args.operationDescriptors.length > MAX_ATTEMPT_OPERATIONS * 2
    ) {
      throw new Error("Publish attempt exceeds the staged operation bounds")
    }
    const descriptorPaths = new Set<string>()
    for (const descriptor of args.operationDescriptors) {
      assertCanonicalOperationPath(descriptor.path)
      if (descriptorPaths.has(descriptor.path)) {
        throw new Error("Publish attempt contains duplicate operation descriptor paths")
      }
      descriptorPaths.add(descriptor.path)
      if (descriptor.action === "delete") {
        if ("expectedBlobSha" in descriptor) throw new Error("Delete descriptor must not contain a blob SHA")
      } else if (!SHA_PATTERN.test(descriptor.expectedBlobSha)) {
        throw new Error("Publish attempt write descriptor blob SHA must be a 40-hex SHA")
      }
    }
    for (const association of args.documentAssociations) {
      if (association.contentRevision !== undefined && !DIGEST_PATTERN.test(association.contentRevision)) {
        throw new Error("Publish attempt content revision must be a 64-hex digest")
      }
      if (
        association.contentVersion !== undefined &&
        (!Number.isInteger(association.contentVersion) || association.contentVersion < 0)
      ) {
        throw new Error("Publish attempt content version must be a non-negative integer")
      }
    }
    const opIdSet = new Set(args.opIds.map(String))
    const mediaIdSet = new Set(args.mediaAssociations.map((a) => String(a.mediaOpId)))
    if (opIdSet.size !== args.opIds.length || mediaIdSet.size !== args.mediaAssociations.length) {
      throw new Error("Publish attempt contains duplicate operation references")
    }
    if (new Set(args.documentAssociations.map((a) => String(a.documentId))).size !== args.documentAssociations.length) {
      throw new Error("Publish attempt contains duplicate document associations")
    }
    if (new Set(args.deleteAssociations.map((a) => String(a.opId))).size !== args.deleteAssociations.length) {
      throw new Error("Publish attempt contains duplicate delete associations")
    }

    // ── Transactional snapshot-freshness validation ──
    // The route planned this publish from an earlier read. Everything the
    // attempt is about to commit must STILL be in that planned state inside
    // this transaction - otherwise a discard/undo/save that raced planning
    // could be committed silently from stale in-memory content.
    const lane = await ctx.db.get(args.publishBranchId)
    if (!lane || lane.projectId !== args.projectId || lane.branchName !== args.branchName) {
      throw new Error("Publish attempt lane does not match the project's publish branch")
    }
    const contentRoot = access.project.contentRoot
    const opById = new Map<string, { opType: string; repoPath: string }>()
    for (const opId of args.opIds) {
      const op = await ctx.db.get(opId)
      if (!op || op.projectId !== args.projectId) {
        throw new Error("Publish attempt references an explorer op outside the project")
      }
      if (op.status !== "pending") {
        throw new Error("Staged changes changed since planning: an operation is no longer pending")
      }
      opById.set(String(opId), {
        opType: op.opType,
        repoPath: resolveStoredRepoPath(
          contentRoot,
          op.filePath,
          op.pathRepresentation as StoredPathRepresentation | undefined,
        ),
      })
    }
    for (const association of args.mediaAssociations) {
      const mediaOp = await ctx.db.get(association.mediaOpId)
      if (!mediaOp || mediaOp.projectId !== args.projectId) {
        throw new Error("Publish attempt references a media op outside the project")
      }
      if (mediaOp.status !== "pending") {
        throw new Error("Staged changes changed since planning: a media upload is no longer pending")
      }
      // Versioned snapshot: an in-place replacement (new bytes, new source)
      // bumps updatedAt, and a moved upload changes repoPath - both must
      // reject rather than committing stale bytes and then marking the
      // NEW row committed.
      if (mediaOp.repoPath !== association.repoPath) {
        throw new Error("Staged changes changed since planning: a media upload path no longer matches")
      }
      if (mediaOp.updatedAt !== association.expectedUpdatedAt) {
        throw new Error("Staged changes changed since planning: a media upload was replaced")
      }
    }
    const validateDocumentSnapshot = async (association: {
      documentId: (typeof args.documentAssociations)[number]["documentId"]
      repoPath: string
      expectedUpdatedAt: number
    }) => {
      const document = await ctx.db.get(association.documentId)
      if (!document || document.projectId !== args.projectId) {
        throw new Error("Publish attempt references a document outside the project")
      }
      if (document.updatedAt !== association.expectedUpdatedAt) {
        throw new Error("Staged changes changed since planning: a document was edited or discarded")
      }
      const resolvedPath = resolveStoredRepoPath(
        contentRoot,
        document.filePath,
        document.pathRepresentation as StoredPathRepresentation | undefined,
      )
      if (resolvedPath !== association.repoPath) {
        throw new Error("Staged changes changed since planning: a document path no longer matches")
      }
    }
    for (const association of args.documentAssociations) {
      await validateDocumentSnapshot(association)
    }
    for (const association of args.deleteAssociations) {
      const owningOp = opById.get(String(association.opId))
      if (!owningOp || owningOp.opType !== "delete") {
        throw new Error("Delete association must reference a pending delete operation included in this attempt")
      }
      // The associated document must still match the planned snapshot AND
      // resolve to the same path as its owning delete operation.
      await validateDocumentSnapshot({
        documentId: association.documentId,
        repoPath: owningOp.repoPath,
        expectedUpdatedAt: association.expectedUpdatedAt,
      })
    }

    const now = Date.now()
    return await ctx.db.insert("publishAttempts", {
      projectId: args.projectId,
      publishBranchId: args.publishBranchId,
      branchName: args.branchName,
      expectedHeadSha: args.expectedHeadSha,
      planDigest: args.planDigest,
      operationDescriptors: args.operationDescriptors,
      operationPaths: args.operationDescriptors.map((descriptor) => descriptor.path),
      opIds: args.opIds,
      mediaAssociations: args.mediaAssociations,
      documentAssociations: args.documentAssociations,
      deleteAssociations: args.deleteAssociations,
      status: "committing",
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Record the landed commit SHA. Valid from "committing" (normal flow and
 * recovery of a crash between commit and this record) and idempotently from
 * "committed" when the same SHA is re-recorded on retry.
 */
export const recordCommit = mutation({
  args: {
    id: v.id("publishAttempts"),
    commitSha: v.string(),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.id)
    if (!attempt) throw new Error("Publish attempt not found")
    await resolveProjectAccess(
      ctx,
      { projectId: attempt.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    if (attempt.status === "committed" && attempt.commitSha === args.commitSha) return
    if (attempt.status !== "committing") {
      throw new Error(`Cannot record a commit on a ${attempt.status} publish attempt`)
    }
    await ctx.db.patch(args.id, { status: "committed", commitSha: args.commitSha, updatedAt: Date.now() })
  },
})

/** Close out an attempt whose Convex reconciliation completed. */
export const markReconciled = mutation({
  args: {
    id: v.id("publishAttempts"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.id)
    if (!attempt) throw new Error("Publish attempt not found")
    await resolveProjectAccess(
      ctx,
      { projectId: attempt.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    if (attempt.status === "reconciled") return
    if (attempt.status !== "committed") {
      throw new Error(`Cannot reconcile a ${attempt.status} publish attempt`)
    }
    await ctx.db.patch(args.id, { status: "reconciled", updatedAt: Date.now() })
  },
})

/**
 * Retire an attempt whose commit provably never landed (branch head still at
 * - or moved past without - the attempt's expected head and no attempt
 * trailer on the head commit). Only "committing" attempts can be superseded;
 * a "committed" attempt has a real commit and must be reconciled instead.
 */
export const supersede = mutation({
  args: {
    id: v.id("publishAttempts"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.id)
    if (!attempt) throw new Error("Publish attempt not found")
    await resolveProjectAccess(
      ctx,
      { projectId: attempt.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    if (attempt.status === "superseded") return
    if (attempt.status !== "committing") {
      throw new Error(`Cannot supersede a ${attempt.status} publish attempt`)
    }
    await ctx.db.patch(args.id, { status: "superseded", updatedAt: Date.now() })
  },
})
