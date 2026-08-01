import { v } from "convex/values"
import { verifyServerQueryToken } from "../lib/project-access-token"
import { mutation } from "./_generated/server"
import { invalidateClosedLaneSync } from "./lib/laneInvalidation"
import { recordMergedLaneAuthority } from "./lib/publishBranchMerge"

/**
 * Handle a GitHub PR merge event.
 * Looks up the publishBranch by PR number, marks it as merged, and runs the
 * SHARED merge finalization (convex/lib/laneMerge.ts): the lane's committed
 * explorer/media ops are spent and the merged documents published. The
 * client fallback (publishBranches.markMerged) and publish-attempt recovery
 * run the same idempotent finalization, so whichever fires first does the
 * work and the others converge as no-ops.
 */
export const handlePRMerged = mutation({
  args: {
    prNumber: v.number(),
    // The merge commit SHA is accepted for API compatibility but never
    // stored: it is a git commit SHA, not a blob SHA, and storing it would
    // break conflict detection (which compares blob SHAs).
    mergeCommitSha: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    headRepoFullName: v.string(),
    headBranch: v.string(),
    serverQueryToken: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await verifyServerQueryToken(args.serverQueryToken))) {
      throw new Error("Unauthorized")
    }

    const candidates = await ctx.db
      .query("publishBranches")
      .withIndex("by_prNumber", (q) => q.eq("prNumber", args.prNumber))
      .take(20)

    let publishBranch = null
    for (const candidate of candidates) {
      const project = await ctx.db.get(candidate.projectId)
      if (
        project &&
        typeof project.repoOwner === "string" &&
        typeof project.repoName === "string" &&
        project.repoOwner.toLowerCase() === args.repoOwner.toLowerCase() &&
        project.repoName.toLowerCase() === args.repoName.toLowerCase() &&
        candidate.branchName === args.headBranch
      ) {
        if (publishBranch) throw new Error("Ambiguous RepoPress publish lane for merged pull request")
        publishBranch = candidate
      }
    }

    if (!publishBranch) {
      // Not a RepoPress PR -- ignore silently
      return
    }
    await recordMergedLaneAuthority(ctx, publishBranch, args)
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
      laneInvalidationPending: true,
      laneCleanupAction: "restore_legacy",
      updatedAt: Date.now(),
    })
    await invalidateClosedLaneSync(ctx, {
      ...publishBranch,
      status: "closed",
      laneInvalidationPending: true,
      laneCleanupAction: "restore_legacy",
    })
  },
})
