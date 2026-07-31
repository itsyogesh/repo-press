import { v } from "convex/values"
import { verifyServerQueryToken } from "../lib/project-access-token"
import { mutation } from "./_generated/server"
import { invalidateClosedLaneSync } from "./lib/laneInvalidation"

/**
 * Handle a GitHub PR merge event.
 * Looks up the publishBranch by PR number, marks it as merged,
 * clears committed explorer ops, and publishes all affected documents.
 */
export const handlePRMerged = mutation({
  args: {
    prNumber: v.number(),
    mergeCommitSha: v.string(),
    serverQueryToken: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await verifyServerQueryToken(args.serverQueryToken))) {
      throw new Error("Unauthorized")
    }

    // 1. Look up publishBranch by PR number
    const publishBranch = await ctx.db
      .query("publishBranches")
      .withIndex("by_prNumber", (q) => q.eq("prNumber", args.prNumber))
      .first()

    if (!publishBranch) {
      // Not a RepoPress PR -- ignore silently
      return
    }

    const projectId = publishBranch.projectId
    const committedPaths = publishBranch.committedFilePaths

    // 2. Mark branch as merged
    await ctx.db.patch(publishBranch._id, {
      status: "merged",
      updatedAt: Date.now(),
    })

    // 3. Clear only committed explorer ops tied to this publish branch
    const committedOps = await ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", projectId).eq("status", "committed"))
      .collect()

    for (const op of committedOps) {
      if (op.status !== "committed" || op.publishBranchId !== publishBranch._id) {
        continue
      }

      await ctx.db.delete(op._id)
    }

    const committedMediaOps = await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", projectId).eq("status", "committed"))
      .collect()

    for (const op of committedMediaOps) {
      if (op.status !== "committed" || op.publishBranchId !== publishBranch._id) {
        continue
      }

      if (op.convexStorageId) {
        try {
          await ctx.storage.delete(op.convexStorageId)
        } catch {
          // Already gone or unavailable; don't block publish finalization.
        }
      }

      await ctx.db.delete(op._id)
    }

    // 4. If no committed file paths were recorded, skip publishing (safe default)
    if (!committedPaths || committedPaths.length === 0) {
      return
    }

    // Build a set of committed paths for fast lookup.
    // committedFilePaths are full repo paths (with contentRoot prefix),
    // but document filePaths are relative to contentRoot. Fetch the project
    // to strip the prefix when matching.
    const project = await ctx.db.get(projectId)
    const contentRoot = project?.contentRoot ?? ""
    const committedRelativePaths = new Set(
      committedPaths.map((p) => {
        if (contentRoot && p.startsWith(`${contentRoot}/`)) {
          return p.slice(contentRoot.length + 1)
        }
        if (contentRoot && p.startsWith(contentRoot)) {
          return p.slice(contentRoot.length)
        }
        return p
      }),
    )

    // 5. Publish only documents whose filePaths are in the committed set
    const drafts = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", projectId).eq("status", "draft"))
      .collect()

    const approved = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", projectId).eq("status", "approved"))
      .collect()

    const docsToPublish = [...drafts, ...approved].filter(
      (d) => d.body != null && committedRelativePaths.has(d.filePath),
    )

    // Also handle docs in non-publishable states (in_review, scheduled)
    const inReview = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", projectId).eq("status", "in_review"))
      .collect()

    const scheduled = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", projectId).eq("status", "scheduled"))
      .collect()

    const otherDocs = [...inReview, ...scheduled].filter(
      (d) => d.body != null && committedRelativePaths.has(d.filePath),
    )

    const now = Date.now()

    for (const doc of docsToPublish) {
      try {
        if (doc.status === "published") continue

        // Do NOT set githubSha here - mergeCommitSha is a git commit SHA,
        // not a blob SHA. The correct blob SHAs were already stored by the
        // publish-ops route before the PR was created. Storing a commit SHA
        // would break conflict detection (which compares blob SHAs).
        await ctx.db.patch(doc._id, {
          status: "published",
          lastSyncedAt: now,
          publishedAt: now,
          updatedAt: now,
        })
      } catch (error) {
        console.error(`Failed to publish document ${doc._id}:`, error)
      }
    }

    for (const doc of otherDocs) {
      try {
        if (doc.status === "published") continue

        await ctx.db.patch(doc._id, {
          status: "draft",
          updatedAt: now,
        })

        await ctx.db.patch(doc._id, {
          status: "published",
          lastSyncedAt: now,
          publishedAt: now,
          updatedAt: now,
        })
      } catch (error) {
        console.error(`Failed to publish document ${doc._id}:`, error)
      }
    }
  },
})

/**
 * Handle a GitHub PR close event (without merge).
 * Marks the publish branch as closed and invalidates the lane's
 * synchronization state: ops committed to the lane are restored to pending
 * (or explicitly discarded when newer pending intent supersedes them) and
 * documents whose publishedProvenance points at the lane become dirty
 * again, so nothing the dead lane held is stranded. Pending staged work is
 * untouched. The client fallback path (publishBranches.markClosed) performs
 * the same invalidation.
 */
export const handlePRClosed = mutation({
  args: {
    prNumber: v.number(),
    serverQueryToken: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await verifyServerQueryToken(args.serverQueryToken))) {
      throw new Error("Unauthorized")
    }

    const publishBranch = await ctx.db
      .query("publishBranches")
      .withIndex("by_prNumber", (q) => q.eq("prNumber", args.prNumber))
      .first()

    if (!publishBranch) return

    await ctx.db.patch(publishBranch._id, {
      status: "closed",
      updatedAt: Date.now(),
    })
    await invalidateClosedLaneSync(ctx, { ...publishBranch, status: "closed" })
  },
})
