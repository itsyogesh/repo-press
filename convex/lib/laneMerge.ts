import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { LANE_CLEANUP_BATCH, scheduleLaneCleanupContinuation } from "./laneInvalidation"
import { findActivePublishAttempt } from "./publishAttemptGuard"

export type LaneMergeResult =
  | { deferred: true }
  | {
      deferred: false
      done: boolean
      clearedOpIds: Id<"explorerOps">[]
      clearedMediaOpIds: Id<"mediaOps">[]
      publishedDocumentIds: Id<"documents">[]
    }

type LaneCleanupCtx = Pick<MutationCtx, "db" | "storage" | "scheduler">

/**
 * Finalize a MERGED publish lane: its commits reached the base branch, so
 * the lane's committed explorer/media ops are spent (rows deleted, staged
 * media bytes released) and the documents whose committed paths merged are
 * published.
 *
 * This is the ONE merge-finalization implementation, shared by the GitHub
 * webhook (githubWebhook.handlePRMerged), the client fallback
 * (publishBranches.markMerged), and publish-attempt recovery - so whichever
 * runs first does the work and the others converge as no-ops. It is
 * idempotent: committed rows exist only until one pass deletes them, and
 * already-published documents are skipped.
 *
 * BOUNDED AND RESUMABLE like closed-lane invalidation: at most
 * LANE_CLEANUP_BATCH rows per table per pass, continuation scheduled while
 * rows remain, and the document-publishing step runs only on the final
 * pass. While a publish attempt is at the commit boundary the pass DEFERS
 * durably (laneInvalidationPending flag) - the attempt may still be marking
 * rows committed for this lane, and finalizing concurrently would let it
 * re-strand rows after this pass ran; recovery and the nightly cron finish
 * flagged lanes once the attempt resolves.
 */
export async function finalizeMergedLaneSync(
  ctx: LaneCleanupCtx,
  branch: Doc<"publishBranches">,
): Promise<LaneMergeResult> {
  const now = Date.now()
  if (await findActivePublishAttempt(ctx.db, branch.projectId)) {
    await ctx.db.patch(branch._id, {
      laneInvalidationPending: true,
      laneCleanupAction: "finalize_legacy",
      updatedAt: now,
    })
    return { deferred: true }
  }

  const clearedOpIds: Id<"explorerOps">[] = []
  const clearedMediaOpIds: Id<"mediaOps">[] = []
  const publishedDocumentIds: Id<"documents">[] = []

  // ── Spend the lane's committed explorer ops (bounded batch) ──
  const committedOpsBatch = await ctx.db
    .query("explorerOps")
    .withIndex("by_publishBranchId_status_publishAttemptId", (q) =>
      q.eq("publishBranchId", branch._id).eq("status", "committed").eq("publishAttemptId", undefined),
    )
    .take(LANE_CLEANUP_BATCH)
  for (const op of committedOpsBatch) {
    clearedOpIds.push(op._id)
    await ctx.db.delete(op._id)
  }

  // ── Release the lane's committed media rows and their staged bytes ──
  const committedMediaBatch = await ctx.db
    .query("mediaOps")
    .withIndex("by_publishBranchId_status_publishAttemptId", (q) =>
      q.eq("publishBranchId", branch._id).eq("status", "committed").eq("publishAttemptId", undefined),
    )
    .take(LANE_CLEANUP_BATCH)
  for (const op of committedMediaBatch) {
    clearedMediaOpIds.push(op._id)
    if (op.convexStorageId) {
      try {
        await ctx.storage.delete(op.convexStorageId)
      } catch {
        // Keep the row as a durable "failed" tombstone so the object stays
        // owned and the nightly cron retries the delete.
        await ctx.db.patch(op._id, {
          status: "failed",
          commitSha: undefined,
          publishBranchId: undefined,
          updatedAt: now,
        })
        continue
      }
    }
    await ctx.db.delete(op._id)
  }

  const done = committedOpsBatch.length < LANE_CLEANUP_BATCH && committedMediaBatch.length < LANE_CLEANUP_BATCH
  if (!done) {
    await scheduleLaneCleanupContinuation(ctx, branch, "finalize_legacy")
    return { deferred: false, done, clearedOpIds, clearedMediaOpIds, publishedDocumentIds }
  }

  // ── Final pass: publish the documents whose committed paths merged ──
  // committedFilePaths are full repo paths (with contentRoot prefix), but
  // document filePaths are relative to contentRoot - strip the prefix when
  // matching. Skipped entirely when nothing was recorded (safe default).
  const committedPaths = branch.committedFilePaths
  if (committedPaths && committedPaths.length > 0) {
    const project = await ctx.db.get(branch.projectId)
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

    const collectStatus = (status: "draft" | "approved" | "in_review" | "scheduled") =>
      ctx.db
        .query("documents")
        .withIndex("by_projectId_status", (q) => q.eq("projectId", branch.projectId).eq("status", status))
        .take(LANE_CLEANUP_BATCH)

    const draftDocs = await collectStatus("draft")
    const approvedDocs = await collectStatus("approved")
    const reviewDocs = await collectStatus("in_review")
    const scheduledDocs = await collectStatus("scheduled")
    const publishableDocs = [...draftDocs, ...approvedDocs].filter(
      (d) => d.body != null && committedRelativePaths.has(d.filePath),
    )
    // Docs in non-publishable states pass through draft first.
    const otherDocs = [...reviewDocs, ...scheduledDocs].filter(
      (d) => d.body != null && committedRelativePaths.has(d.filePath),
    )

    for (const doc of publishableDocs) {
      if (doc.status === "published") continue
      // Do NOT set githubSha here - the merge commit SHA is a git commit
      // SHA, not a blob SHA. The correct blob SHAs were already stored by
      // the publish-ops route before the PR was created.
      await ctx.db.patch(doc._id, {
        status: "published",
        lastSyncedAt: now,
        publishedAt: now,
        updatedAt: now,
      })
      publishedDocumentIds.push(doc._id)
    }
    for (const doc of otherDocs) {
      if (doc.status === "published") continue
      await ctx.db.patch(doc._id, { status: "draft", updatedAt: now })
      await ctx.db.patch(doc._id, {
        status: "published",
        lastSyncedAt: now,
        publishedAt: now,
        updatedAt: now,
      })
      publishedDocumentIds.push(doc._id)
    }

    if ([draftDocs, approvedDocs, reviewDocs, scheduledDocs].some((rows) => rows.length === LANE_CLEANUP_BATCH)) {
      await scheduleLaneCleanupContinuation(ctx, branch, "finalize_legacy")
      return { deferred: false, done: false, clearedOpIds, clearedMediaOpIds, publishedDocumentIds }
    }
  }

  if (branch.laneInvalidationPending) {
    await ctx.db.patch(branch._id, {
      laneInvalidationPending: undefined,
      laneCleanupAction: undefined,
      updatedAt: now,
    })
  }

  return { deferred: false, done, clearedOpIds, clearedMediaOpIds, publishedDocumentIds }
}
