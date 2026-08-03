import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

type OwnershipDb = Pick<MutationCtx, "db">["db"]

function ownershipError(detail: string): never {
  throw new Error(`Publish attempt ownership mismatch: ${detail}`)
}

export async function requireCommittedAttempt(
  db: OwnershipDb,
  args: {
    attemptId: Id<"publishAttempts">
    projectId: Id<"projects">
    publishBranchId?: Id<"publishBranches">
    commitSha: string
  },
): Promise<Doc<"publishAttempts">> {
  if (!args.publishBranchId) ownershipError("publish lane is required")
  const attempt = await db.get(args.attemptId)
  if (
    !attempt ||
    attempt.status !== "committed" ||
    attempt.projectId !== args.projectId ||
    attempt.publishBranchId !== args.publishBranchId ||
    attempt.commitSha !== args.commitSha
  ) {
    ownershipError("attempt, project, lane, commit, or status differs")
  }
  return attempt
}

export function requireExplorerAssociation(
  attempt: Doc<"publishAttempts">,
  args: { opId: Id<"explorerOps">; repoPath: string; expectedUpdatedAt: number },
) {
  const association = attempt.explorerAssociations?.find((candidate) => candidate.opId === args.opId)
  if (
    !association ||
    association.repoPath !== args.repoPath ||
    association.expectedUpdatedAt !== args.expectedUpdatedAt
  ) {
    ownershipError("explorer association or snapshot differs")
  }
}

export function requireMediaAssociation(
  attempt: Doc<"publishAttempts">,
  args: { mediaOpId: Id<"mediaOps">; repoPath: string; expectedUpdatedAt: number },
) {
  const association = attempt.mediaAssociations.find((candidate) => candidate.mediaOpId === args.mediaOpId)
  if (
    !association ||
    association.repoPath !== args.repoPath ||
    association.expectedUpdatedAt !== args.expectedUpdatedAt
  ) {
    ownershipError("media association or snapshot differs")
  }
}

export function requireDocumentAssociation(
  attempt: Doc<"publishAttempts">,
  args: {
    documentId: Id<"documents">
    repoPath?: string
    expectedUpdatedAt: number
    contentRevision?: string
    contentVersion?: number
  },
) {
  const association = attempt.documentAssociations.find((candidate) => candidate.documentId === args.documentId)
  if (
    !association ||
    !args.repoPath ||
    association.repoPath !== args.repoPath ||
    association.expectedUpdatedAt !== args.expectedUpdatedAt ||
    association.contentRevision !== args.contentRevision ||
    association.contentVersion !== args.contentVersion
  ) {
    ownershipError("document association or snapshot differs")
  }
}
