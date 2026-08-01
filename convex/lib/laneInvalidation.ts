import { resolveStoredRepoPath, type StoredPathRepresentation, toContentPath } from "../../lib/preview/path-policy"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { findActivePublishAttempt } from "./publishAttemptGuard"

/**
 * Rows processed per table per pass. A reused lane can accumulate several
 * 500-operation publishes, so cleanup NEVER scans a lane's whole history in
 * one transaction: each pass is bounded, and an incomplete pass keeps the
 * lane's laneInvalidationPending flag set and schedules a continuation.
 */
export const LANE_CLEANUP_BATCH = 100

export type LaneInvalidationResult =
  | { deferred: true }
  | {
      deferred: false
      done: boolean
      restoredOpIds: Id<"explorerOps">[]
      discardedOpIds: Id<"explorerOps">[]
      restoredMediaOpIds: Id<"mediaOps">[]
      discardedMediaOpIds: Id<"mediaOps">[]
      invalidatedDocumentIds: Id<"documents">[]
    }

type LaneCleanupCtx = Pick<MutationCtx, "db" | "storage" | "scheduler">
type LaneCleanupSchedulerCtx = Pick<MutationCtx, "db" | "scheduler">

/** Keep the durable flag set and schedule the next bounded pass. */
export async function scheduleLaneCleanupContinuation(
  ctx: LaneCleanupSchedulerCtx,
  branch: Doc<"publishBranches">,
  action: "restore_legacy" | "finalize_legacy",
) {
  if (branch.laneCleanupAction && branch.laneCleanupAction !== action) {
    throw new Error("Conflicting persisted legacy lane cleanup action")
  }
  if (!branch.laneInvalidationPending) {
    await ctx.db.patch(branch._id, { laneInvalidationPending: true, laneCleanupAction: action, updatedAt: Date.now() })
  }
  await ctx.scheduler.runAfter(0, internal.publishBranches.continueLaneCleanup, { id: branch._id })
}

/**
 * The stored filePath values that can resolve to one repo path: the
 * canonical content-relative form and the legacy repo-root-relative form.
 * Lets per-path lookups use the by_projectId_filePath index instead of
 * scanning every row of a table.
 */
function candidateStoredFilePaths(contentRoot: string, repoPath: string): string[] {
  const candidates = new Set<string>([repoPath])
  try {
    candidates.add(toContentPath(contentRoot, repoPath))
  } catch {
    // Outside the content root: only the legacy form can exist.
  }
  return [...candidates]
}

/**
 * Invalidate the synchronization state a closed-unmerged lane left behind.
 *
 * When a publish lane's PR is closed without merging, everything that was
 * "published" to it never reached the base branch: explorer/media ops were
 * marked committed and documents recorded publishedProvenance for a branch
 * that is now dead. Without this pass that content is stranded - excluded
 * from listPending/listDirtyForProject with no way to republish.
 *
 * Restores the lane's committed operations to pending (so the next publish
 * re-commits them to a live lane) and clears document provenance pointing at
 * the lane (so their content is dirty again). Newer pending intent wins
 * conflicts: a committed op/upload whose path already has a pending
 * replacement is explicitly discarded instead of restored, and a
 * create+delete pair on the same path cancels out (their net effect vs the
 * base branch is nothing; any surviving content republishes through its
 * dirty document).
 *
 * Runs after either the GitHub webhook or authenticated status synchronization
 * persists a server-verified close. It is idempotent: a second pass finds no
 * committed rows or provenance for the lane and changes nothing.
 *
 * BOUNDED AND RESUMABLE: each invocation processes at most
 * LANE_CLEANUP_BATCH rows per table (fetched through lane-scoped indexes,
 * with per-path index lookups for conflict checks), and schedules a
 * continuation while work remains. While a publish attempt is at the commit
 * boundary for the project the pass DEFERS durably (laneInvalidationPending
 * flag): the attempt may still be writing synchronization state for this
 * lane, and restoring concurrently would let it re-strand content after
 * this pass ran. Attempt recovery and the nightly cron finish flagged lanes
 * once the attempt resolves.
 */
export async function invalidateClosedLaneSync(
  ctx: LaneCleanupCtx,
  branch: Doc<"publishBranches">,
): Promise<LaneInvalidationResult> {
  const now = Date.now()
  if (await findActivePublishAttempt(ctx.db, branch.projectId)) {
    await ctx.db.patch(branch._id, {
      laneInvalidationPending: true,
      laneCleanupAction: "restore_legacy",
      updatedAt: now,
    })
    return { deferred: true }
  }

  const project = await ctx.db.get(branch.projectId)
  const contentRoot = project?.contentRoot ?? ""
  const resolveOpPath = (op: { filePath: string; pathRepresentation?: string }) =>
    resolveStoredRepoPath(contentRoot, op.filePath, op.pathRepresentation as StoredPathRepresentation | undefined)

  const restoredOpIds: Id<"explorerOps">[] = []
  const discardedOpIds: Id<"explorerOps">[] = []
  const restoredMediaOpIds: Id<"mediaOps">[] = []
  const discardedMediaOpIds: Id<"mediaOps">[] = []
  const invalidatedDocumentIds: Id<"documents">[] = []

  // ── Explorer ops committed to this lane (bounded batch) ──
  const committedOpsBatch = await ctx.db
    .query("explorerOps")
    .withIndex("by_publishBranchId_status_publishAttemptId", (q) =>
      q.eq("publishBranchId", branch._id).eq("status", "committed").eq("publishAttemptId", undefined),
    )
    .take(LANE_CLEANUP_BATCH)

  // All committed lane ops that resolve to one path, fetched through the
  // per-path index so a create+delete pair split across batches still
  // cancels out as a unit.
  const committedLaneOpsAtPath = async (repoPath: string) => {
    const mates = new Map<string, Doc<"explorerOps">>()
    for (const filePath of candidateStoredFilePaths(contentRoot, repoPath)) {
      const rows = await ctx.db
        .query("explorerOps")
        .withIndex("by_projectId_filePath", (q) => q.eq("projectId", branch.projectId).eq("filePath", filePath))
        .take(LANE_CLEANUP_BATCH + 1)
      if (rows.length > LANE_CLEANUP_BATCH) throw new Error("Legacy lane path exceeds the bounded cleanup limit")
      for (const row of rows) {
        if (row.status !== "committed" || row.publishBranchId !== branch._id) continue
        if (resolveOpPath(row) !== repoPath) continue
        mates.set(String(row._id), row)
      }
    }
    return [...mates.values()]
  }
  const hasPendingOpAtPath = async (repoPath: string) => {
    for (const filePath of candidateStoredFilePaths(contentRoot, repoPath)) {
      const rows = await ctx.db
        .query("explorerOps")
        .withIndex("by_projectId_filePath", (q) => q.eq("projectId", branch.projectId).eq("filePath", filePath))
        .take(LANE_CLEANUP_BATCH + 1)
      if (rows.length > LANE_CLEANUP_BATCH) throw new Error("Legacy lane path exceeds the bounded cleanup limit")
      if (rows.some((row) => row.status === "pending" && resolveOpPath(row) === repoPath)) return true
    }
    return false
  }

  const handledOpIds = new Set<string>()
  for (const batchOp of committedOpsBatch) {
    if (handledOpIds.has(String(batchOp._id))) continue
    const repoPath = resolveOpPath(batchOp)
    const ops = await committedLaneOpsAtPath(repoPath)
    for (const op of ops) handledOpIds.add(String(op._id))

    const cancelsOut = ops.some((op) => op.opType === "create") && ops.some((op) => op.opType === "delete")
    if (cancelsOut || (await hasPendingOpAtPath(repoPath))) {
      for (const op of ops) {
        discardedOpIds.push(op._id)
        await ctx.db.delete(op._id)
      }
      continue
    }
    const [newest, ...older] = [...ops].sort((a, b) => b.updatedAt - a.updatedAt)
    restoredOpIds.push(newest._id)
    await ctx.db.patch(newest._id, {
      status: "pending",
      commitSha: undefined,
      publishBranchId: undefined,
      updatedAt: now,
    })
    for (const op of older) {
      discardedOpIds.push(op._id)
      await ctx.db.delete(op._id)
    }
  }

  // ── Media ops committed to this lane (their bytes are still staged) ──
  const committedMediaBatch = await ctx.db
    .query("mediaOps")
    .withIndex("by_publishBranchId_status_publishAttemptId", (q) =>
      q.eq("publishBranchId", branch._id).eq("status", "committed").eq("publishAttemptId", undefined),
    )
    .take(LANE_CLEANUP_BATCH)

  const mediaRowsAtPath = async (repoPath: string) => {
    const rows = await ctx.db
      .query("mediaOps")
      .withIndex("by_projectId_repoPath", (q) => q.eq("projectId", branch.projectId).eq("repoPath", repoPath))
      .take(LANE_CLEANUP_BATCH + 1)
    if (rows.length > LANE_CLEANUP_BATCH) throw new Error("Legacy lane media path exceeds the bounded cleanup limit")
    return rows
  }

  const discardMediaOp = async (op: Doc<"mediaOps">) => {
    discardedMediaOpIds.push(op._id)
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
        return
      }
    }
    await ctx.db.delete(op._id)
  }

  const handledMediaIds = new Set<string>()
  for (const batchOp of committedMediaBatch) {
    if (handledMediaIds.has(String(batchOp._id))) continue
    const rowsAtPath = await mediaRowsAtPath(batchOp.repoPath)
    const laneRows = rowsAtPath.filter((row) => row.status === "committed" && row.publishBranchId === branch._id)
    for (const row of laneRows) handledMediaIds.add(String(row._id))

    const sorted = [...laneRows].sort((a, b) => b.updatedAt - a.updatedAt)
    if (rowsAtPath.some((row) => row.status === "pending")) {
      for (const op of sorted) await discardMediaOp(op)
      continue
    }
    const [newest, ...older] = sorted
    restoredMediaOpIds.push(newest._id)
    await ctx.db.patch(newest._id, {
      status: "pending",
      commitSha: undefined,
      publishBranchId: undefined,
      updatedAt: now,
    })
    for (const op of older) await discardMediaOp(op)
  }

  // ── Documents whose clean state points at this lane (bounded batch) ──
  const documentsBatch = await ctx.db
    .query("documents")
    .withIndex("by_publishedProvenance_lane_attempt", (q) =>
      q.eq("publishedProvenance.publishBranchId", branch._id).eq("publishedProvenance.publishAttemptId", undefined),
    )
    .take(LANE_CLEANUP_BATCH)
  for (const doc of documentsBatch) {
    invalidatedDocumentIds.push(doc._id)
    await ctx.db.patch(doc._id, { publishedProvenance: undefined })
  }

  const done =
    committedOpsBatch.length < LANE_CLEANUP_BATCH &&
    committedMediaBatch.length < LANE_CLEANUP_BATCH &&
    documentsBatch.length < LANE_CLEANUP_BATCH
  if (!done) {
    await scheduleLaneCleanupContinuation(ctx, branch, "restore_legacy")
  } else if (branch.laneInvalidationPending) {
    await ctx.db.patch(branch._id, {
      laneInvalidationPending: undefined,
      laneCleanupAction: undefined,
      updatedAt: now,
    })
  }

  return {
    deferred: false,
    done,
    restoredOpIds,
    discardedOpIds,
    restoredMediaOpIds,
    discardedMediaOpIds,
    invalidatedDocumentIds,
  }
}
