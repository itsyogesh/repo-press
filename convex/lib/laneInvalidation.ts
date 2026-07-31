import { resolveStoredRepoPath, type StoredPathRepresentation } from "../../lib/preview/path-policy"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { findActivePublishAttempt } from "./publishAttemptGuard"

export type LaneInvalidationResult =
  | { deferred: true }
  | {
      deferred: false
      restoredOpIds: Id<"explorerOps">[]
      discardedOpIds: Id<"explorerOps">[]
      restoredMediaOpIds: Id<"mediaOps">[]
      discardedMediaOpIds: Id<"mediaOps">[]
      invalidatedDocumentIds: Id<"documents">[]
    }

type LaneInvalidationCtx = Pick<MutationCtx, "db" | "storage">

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
 * Runs from BOTH close paths (GitHub webhook and the client fallback that
 * detects an externally closed PR) and is idempotent: a second pass finds no
 * committed rows or provenance for the lane and changes nothing.
 *
 * While a publish attempt is at the commit boundary for the project the pass
 * DEFERS durably (laneInvalidationPending flag): the attempt may still be
 * marking ops committed / stamping provenance for this lane, and restoring
 * concurrently would let it re-strand content after this pass ran. Attempt
 * recovery and the nightly cron finish flagged lanes once the attempt
 * resolves.
 */
export async function invalidateClosedLaneSync(
  ctx: LaneInvalidationCtx,
  branch: Doc<"publishBranches">,
): Promise<LaneInvalidationResult> {
  const now = Date.now()
  if (await findActivePublishAttempt(ctx.db, branch.projectId)) {
    await ctx.db.patch(branch._id, { laneInvalidationPending: true, updatedAt: now })
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

  // ── Explorer ops committed to this lane ──
  const pendingOps = await ctx.db
    .query("explorerOps")
    .withIndex("by_projectId_status", (q) => q.eq("projectId", branch.projectId).eq("status", "pending"))
    .collect()
  const pendingOpPaths = new Set(pendingOps.map(resolveOpPath))
  const committedOps = await ctx.db
    .query("explorerOps")
    .withIndex("by_projectId_status", (q) => q.eq("projectId", branch.projectId).eq("status", "committed"))
    .collect()
  const laneOpsByPath = new Map<string, Doc<"explorerOps">[]>()
  for (const op of committedOps) {
    if (op.publishBranchId !== branch._id) continue
    const repoPath = resolveOpPath(op)
    const group = laneOpsByPath.get(repoPath) ?? []
    group.push(op)
    laneOpsByPath.set(repoPath, group)
  }
  for (const [repoPath, ops] of laneOpsByPath) {
    const cancelsOut = ops.some((op) => op.opType === "create") && ops.some((op) => op.opType === "delete")
    if (cancelsOut || pendingOpPaths.has(repoPath)) {
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
  const pendingMediaOps = await ctx.db
    .query("mediaOps")
    .withIndex("by_projectId_status", (q) => q.eq("projectId", branch.projectId).eq("status", "pending"))
    .collect()
  const pendingMediaPaths = new Set(pendingMediaOps.map((op) => op.repoPath))
  const committedMediaOps = await ctx.db
    .query("mediaOps")
    .withIndex("by_projectId_status", (q) => q.eq("projectId", branch.projectId).eq("status", "committed"))
    .collect()
  const laneMediaByPath = new Map<string, Doc<"mediaOps">[]>()
  for (const op of committedMediaOps) {
    if (op.publishBranchId !== branch._id) continue
    const group = laneMediaByPath.get(op.repoPath) ?? []
    group.push(op)
    laneMediaByPath.set(op.repoPath, group)
  }
  const discardMediaOp = async (op: Doc<"mediaOps">) => {
    if (op.convexStorageId) {
      try {
        await ctx.storage.delete(op.convexStorageId)
      } catch {
        // Already gone.
      }
    }
    discardedMediaOpIds.push(op._id)
    await ctx.db.delete(op._id)
  }
  for (const [repoPath, ops] of laneMediaByPath) {
    const sorted = [...ops].sort((a, b) => b.updatedAt - a.updatedAt)
    if (pendingMediaPaths.has(repoPath)) {
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

  // ── Documents whose clean state points at this lane ──
  const documents = await ctx.db
    .query("documents")
    .withIndex("by_projectId", (q) => q.eq("projectId", branch.projectId))
    .collect()
  for (const doc of documents) {
    if (doc.publishedProvenance?.publishBranchId !== branch._id) continue
    invalidatedDocumentIds.push(doc._id)
    await ctx.db.patch(doc._id, { publishedProvenance: undefined })
  }

  if (branch.laneInvalidationPending) {
    await ctx.db.patch(branch._id, { laneInvalidationPending: undefined, updatedAt: now })
  }

  return {
    deferred: false,
    restoredOpIds,
    discardedOpIds,
    restoredMediaOpIds,
    discardedMediaOpIds,
    invalidatedDocumentIds,
  }
}
