type BuildRestoreVersionMutationInput<TDocumentId> = {
  documentId: TDocumentId
  body: string
  frontmatter?: unknown
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
      body: input.body,
      frontmatter: input.frontmatter,
      editedBy: input.editedBy,
      message: `Restored to version from ${new Date(input.historyCreatedAt).toISOString()}`,
      changeType: "patch",
      createdAt: input.now,
    },
    documentPatch: {
      body: input.body,
      frontmatter: input.frontmatter,
      updatedAt: input.now,
    },
  }
}
