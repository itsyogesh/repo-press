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

    // 4. Publish all draft/approved documents that have body content
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

    const docsToPublish = [...drafts, ...approved].filter((d) => d.body != null)

    // Also handle docs in non-publishable states (in_review, scheduled)
    // These need to transition through draft first per the state machine
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

    const otherDocs = [...inReview, ...scheduled].filter((d) => d.body != null)

    const now = Date.now()

    // Publish each document with per-document error handling for idempotency
    for (const doc of docsToPublish) {
      try {
        // Already published -- skip (idempotent)
        if (doc.status === "published") continue

        await ctx.db.patch(doc._id, {
          status: "published",
          githubSha: args.mergeCommitSha,
          lastSyncedAt: now,
          publishedAt: now,
          updatedAt: now,
        })
      } catch (error) {
        console.error(`Failed to publish document ${doc._id}:`, error)
      }
    }

    // Handle docs in non-publishable states: transition to draft first, then publish
    for (const doc of otherDocs) {
      try {
        if (doc.status === "published") continue

        // Transition through draft first per ALLOWED_TRANSITIONS
        await ctx.db.patch(doc._id, {
          status: "draft",
          updatedAt: now,
        })

        await ctx.db.patch(doc._id, {
          status: "published",
          githubSha: args.mergeCommitSha,
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
