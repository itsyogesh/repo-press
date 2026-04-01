export interface DiscardPlanPendingOp {
  _id: string
  opType: "create" | "delete"
  filePath: string
  status: string
}

export interface DiscardPlanDirtyDoc {
  _id: string
  filePath: string
}

export interface DiscardPlanPendingMediaOp {
  _id: string
  repoPath: string
  status: string
  sourceFilePath?: string
}

export interface DiscardPlan {
  opIdsToUndo: string[]
  dirtyDocIdsToDiscard: string[]
  mediaRepoPathsToUndo: string[]
  filePathsToReset: string[]
}

export function getDiscardPlan({
  pendingOps,
  dirtyDocs,
  pendingMediaOps = [],
}: {
  pendingOps: DiscardPlanPendingOp[]
  dirtyDocs: DiscardPlanDirtyDoc[]
  pendingMediaOps?: DiscardPlanPendingMediaOp[]
}): DiscardPlan {
  const activeOps = pendingOps.filter((op) => op.status === "pending")
  const pendingCreatePaths = new Set(activeOps.filter((op) => op.opType === "create").map((op) => op.filePath))
  const discardableDirtyDocs = dirtyDocs.filter((doc) => !pendingCreatePaths.has(doc.filePath))
  const activeMediaOps = pendingMediaOps.filter((op) => op.status === "pending")
  const mediaSourcePaths = activeMediaOps
    .map((op) => op.sourceFilePath?.trim())
    .filter((path): path is string => Boolean(path))

  return {
    opIdsToUndo: activeOps.map((op) => op._id),
    dirtyDocIdsToDiscard: discardableDirtyDocs.map((doc) => doc._id),
    mediaRepoPathsToUndo: activeMediaOps.map((op) => op.repoPath),
    filePathsToReset: Array.from(
      new Set([
        ...activeOps.map((op) => op.filePath),
        ...discardableDirtyDocs.map((doc) => doc.filePath),
        ...mediaSourcePaths,
      ]),
    ),
  }
}
