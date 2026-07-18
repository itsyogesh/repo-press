import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"
import { findActivePublishAttempt } from "./lib/publishAttemptGuard"

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
    operationPaths: v.array(v.string()),
    opIds: v.array(v.id("explorerOps")),
    mediaOpIds: v.array(v.id("mediaOps")),
    deleteAssociations: v.array(deleteAssociationValidator),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(
      ctx,
      { projectId: args.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    const active = await findActivePublishAttempt(ctx.db, args.projectId)
    if (active) {
      throw new Error("Another publish attempt is still active for this project")
    }
    const now = Date.now()
    return await ctx.db.insert("publishAttempts", {
      projectId: args.projectId,
      publishBranchId: args.publishBranchId,
      branchName: args.branchName,
      expectedHeadSha: args.expectedHeadSha,
      planDigest: args.planDigest,
      operationPaths: args.operationPaths,
      opIds: args.opIds,
      mediaOpIds: args.mediaOpIds,
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
