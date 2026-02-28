import { v } from "convex/values"
import { mutation } from "./_generated/server"

/**
 * Handle a GitHub PR merge event.
 * Looks up the publishBranch by PR number, marks it as merged,
 * clears committed explorer ops, and publishes all affected documents.
 */
export const handlePRMerged = mutation({
  args: {
    prNumber: v.number(),
    mergeCommitSha: v.string(),
  },
  handler: async (ctx, args) => {
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

    // 3. Clear all committed explorer ops for this project
    const committedOps = await ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_status", (q) =>
        q.eq("projectId", projectId).eq("status", "committed"),
      )
      .collect()

    for (const op of committedOps) {
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
        if (contentRoot && p.startsWith(contentRoot + "/")) {
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
      .withIndex("by_projectId_status", (q) =>
        q.eq("projectId", projectId).eq("status", "draft"),
      )
      .collect()

    const approved = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) =>
        q.eq("projectId", projectId).eq("status", "approved"),
      )
      .collect()

    const docsToPublish = [...drafts, ...approved].filter(
      (d) => d.body != null && committedRelativePaths.has(d.filePath),
    )

    // Also handle docs in non-publishable states (in_review, scheduled)
    const inReview = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) =>
        q.eq("projectId", projectId).eq("status", "in_review"),
      )
      .collect()

    const scheduled = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) =>
        q.eq("projectId", projectId).eq("status", "scheduled"),
      )
      .collect()

    const otherDocs = [...inReview, ...scheduled].filter(
      (d) => d.body != null && committedRelativePaths.has(d.filePath),
    )

    const now = Date.now()

    for (const doc of docsToPublish) {
      try {
        if (doc.status === "published") continue

        // Do NOT set githubSha here — mergeCommitSha is a git commit SHA,
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
 * Marks the publish branch as closed. Explorer ops remain pending
 * so the user can re-publish later.
 */
export const handlePRClosed = mutation({
  args: {
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const publishBranch = await ctx.db
      .query("publishBranches")
      .withIndex("by_prNumber", (q) => q.eq("prNumber", args.prNumber))
      .first()

    if (!publishBranch) return

    await ctx.db.patch(publishBranch._id, {
      status: "closed",
      updatedAt: Date.now(),
    })
  },
})
