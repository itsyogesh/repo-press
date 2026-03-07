type BuildRestoreVersionMutationInput<TDocumentId> = {
  documentId: TDocumentId
  currentBody: string
  currentFrontmatter?: unknown
  targetBody: string
  targetFrontmatter?: unknown
  editedBy: string
  historyCreatedAt: number
  now: number
}

type BuildRestoreVersionMutationResult<TDocumentId> = {
  historyInsert: {
    documentId: TDocumentId
    body: string
    frontmatter?: unknown
    editedBy: string
    message: string
    changeType: "patch"
    createdAt: number
  }
  documentPatch: {
    body: string
    frontmatter?: unknown
    updatedAt: number
  }
}

export function buildRestoreVersionMutation<TDocumentId>(
  input: BuildRestoreVersionMutationInput<TDocumentId>,
): BuildRestoreVersionMutationResult<TDocumentId> {
  return {
    historyInsert: {
      documentId: input.documentId,
      body: input.currentBody,
      frontmatter: input.currentFrontmatter,
      editedBy: input.editedBy,
      message: `Restored to version from ${new Date(input.historyCreatedAt).toISOString()}`,
      changeType: "patch",
      createdAt: input.now,
    },
    documentPatch: {
      body: input.targetBody,
      frontmatter: input.targetFrontmatter,
      updatedAt: input.now,
    },
  }
}
