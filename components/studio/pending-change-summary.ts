import type {
  DiscardPlan,
  DiscardPlanDirtyDoc,
  DiscardPlanPendingMediaOp,
  DiscardPlanPendingOp,
} from "./discard-pending-changes"

export interface PendingChangeSummary {
  creates: number
  deletes: number
  edits: number
  media: number
  total: number
}

export function getPendingChangeSummary({
  pendingOps = [],
  dirtyDocs = [],
  pendingMediaOps = [],
}: {
  pendingOps?: DiscardPlanPendingOp[]
  dirtyDocs?: DiscardPlanDirtyDoc[]
  pendingMediaOps?: DiscardPlanPendingMediaOp[]
}): PendingChangeSummary {
  const activePendingOps = pendingOps.filter((op) => op.status === "pending")
  const creatingFilePaths = new Set(activePendingOps.filter((op) => op.opType === "create").map((op) => op.filePath))

  const creates = activePendingOps.filter((op) => op.opType === "create").length
  const deletes = activePendingOps.filter((op) => op.opType === "delete").length
  const edits = dirtyDocs.filter((doc) => !creatingFilePaths.has(doc.filePath)).length
  const media = pendingMediaOps.filter((op) => op.status === "pending").length

  return {
    creates,
    deletes,
    edits,
    media,
    total: creates + deletes + edits + media,
  }
}

export function hasDiscardableChanges(plan: DiscardPlan): boolean {
  return plan.opIdsToUndo.length > 0 || plan.dirtyDocIdsToDiscard.length > 0 || plan.mediaRepoPathsToUndo.length > 0
}
