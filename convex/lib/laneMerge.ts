import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { isDocumentContentClean } from "./documentCleanliness"
import { LANE_CLEANUP_BATCH, scheduleLaneCleanupContinuation } from "./laneInvalidation"
import { deleteOwnedMediaStorageOrKeepTombstone } from "./mediaTombstone"
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
 * legacy committed explorer/media ops are spent (rows deleted, staged media
 * bytes released). Documents are eligible only when they carry explicit
 * pre-attempt provenance for this lane; lane-wide paths are never document
 * authority.
 *
 * This is the ONE merge-finalization implementation, reached only after
 * server-verified GitHub authority has been persisted. Webhook delivery,
 * authenticated status synchronization, and publish-attempt recovery all
 * converge on this idempotent cleanup: committed rows exist only until one
 * pass deletes them, and already-published documents are skipped.
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
    await deleteOwnedMediaStorageOrKeepTombstone(ctx, op)
  }

  const legacyRowsDone =
    committedOpsBatch.length < LANE_CLEANUP_BATCH && committedMediaBatch.length < LANE_CLEANUP_BATCH
  if (!legacyRowsDone) {
    await scheduleLaneCleanupContinuation(ctx, branch, "finalize_legacy")
    return { deferred: false, done: false, clearedOpIds, clearedMediaOpIds, publishedDocumentIds }
  }

  // ── Final pass: publish only explicitly-owned legacy snapshots ──
  // Modern provenance always carries publishAttemptId and is reconciled only
  // by immutable-tree attempt cleanup. The compound index excludes it before
  // mutation, so a lane path can never publish a newer/modern document.
  const statuses = ["draft", "approved", "in_review", "scheduled"] as const
  const legacyDocumentBatches = await Promise.all(
    statuses.map((status) =>
      ctx.db
        .query("documents")
        .withIndex("by_publishedProvenance_lane_attempt_status", (q) =>
          q
            .eq("publishedProvenance.publishBranchId", branch._id)
            .eq("publishedProvenance.publishAttemptId", undefined)
            .eq("status", status),
        )
        .take(LANE_CLEANUP_BATCH),
    ),
  )
  for (const doc of legacyDocumentBatches.flat()) {
    const provenance = doc.publishedProvenance
    if (!provenance || provenance.publishAttemptId !== undefined || provenance.publishBranchId !== branch._id) continue
    const unchanged = isDocumentContentClean(doc)
    if (!unchanged || doc.body == null) {
      // The recorded legacy snapshot no longer represents current content.
      // Drop only stale synchronization provenance; preserve the edit and its
      // workflow status for a future publish.
      await ctx.db.patch(doc._id, { publishedProvenance: undefined })
      continue
    }
    // Do not bump content updatedAt: timestamp-based legacy provenance uses
    // that value as its immutable snapshot identity.
    await ctx.db.patch(doc._id, {
      status: "published",
      lastSyncedAt: now,
      publishedAt: now,
    })
    publishedDocumentIds.push(doc._id)
  }
  if (legacyDocumentBatches.some((rows) => rows.length === LANE_CLEANUP_BATCH)) {
    await scheduleLaneCleanupContinuation(ctx, branch, "finalize_legacy")
    return { deferred: false, done: false, clearedOpIds, clearedMediaOpIds, publishedDocumentIds }
  }

  if (branch.laneInvalidationPending) {
    await ctx.db.patch(branch._id, {
      laneInvalidationPending: undefined,
      laneCleanupAction: undefined,
      updatedAt: now,
    })
  }

  return { deferred: false, done: true, clearedOpIds, clearedMediaOpIds, publishedDocumentIds }
}
