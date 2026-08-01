import { assertCanonicalPublishOperationPath, gitRepositoryPathIdentity } from "../../lib/git-path-policy"
import type { Doc } from "../_generated/dataModel"

type DescriptorAction = "create" | "update" | "delete"
const DIGEST_PATTERN = /^[0-9a-f]{64}$/

type AssociationSnapshots = Pick<
  Doc<"publishAttempts">,
  "explorerAssociations" | "mediaAssociations" | "documentAssociations" | "deleteAssociations"
>

function assertSnapshotTimestamp(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Publish attempt ${label} association has an invalid snapshot timestamp`)
  }
}

/** Validate immutable association snapshot shapes at begin and cleanup. */
export function assertPublishAttemptAssociationSnapshotShapes(snapshots: AssociationSnapshots) {
  const explorerById = new Set<string>()
  for (const association of snapshots.explorerAssociations ?? []) {
    assertCanonicalPublishOperationPath(association.repoPath)
    assertSnapshotTimestamp(association.expectedUpdatedAt, "explorer")
    explorerById.add(String(association.opId))
  }
  for (const association of snapshots.mediaAssociations) {
    assertCanonicalPublishOperationPath(association.repoPath)
    assertSnapshotTimestamp(association.expectedUpdatedAt, "media")
  }
  for (const association of snapshots.documentAssociations) {
    assertCanonicalPublishOperationPath(association.repoPath)
    assertSnapshotTimestamp(association.expectedUpdatedAt, "document")
    if (association.contentRevision !== undefined && !DIGEST_PATTERN.test(association.contentRevision)) {
      throw new Error("Publish attempt content revision must be a 64-hex digest")
    }
    if (
      association.contentVersion !== undefined &&
      (!Number.isInteger(association.contentVersion) || association.contentVersion < 0)
    ) {
      throw new Error("Publish attempt content version must be a non-negative integer")
    }
  }
  for (const association of snapshots.deleteAssociations) {
    assertSnapshotTimestamp(association.expectedUpdatedAt, "delete")
    if (!explorerById.has(String(association.opId))) {
      throw new Error("Publish attempt delete association has no exact explorer snapshot link")
    }
  }
}

function descriptorMap(attempt: Doc<"publishAttempts">) {
  const descriptors = new Map<string, NonNullable<Doc<"publishAttempts">["operationDescriptors"]>[number]>()
  for (const descriptor of attempt.operationDescriptors ?? []) {
    assertCanonicalPublishOperationPath(descriptor.path)
    const identity = gitRepositoryPathIdentity(descriptor.path)
    if (descriptors.has(identity)) throw new Error("Publish attempt contains duplicate descriptor identities")
    descriptors.set(identity, descriptor)
  }
  return descriptors
}

function requireDescriptor(
  descriptors: ReturnType<typeof descriptorMap>,
  path: string,
  allowedActions: readonly DescriptorAction[],
  label: string,
) {
  assertCanonicalPublishOperationPath(path)
  const descriptor = descriptors.get(gitRepositoryPathIdentity(path))
  if (!descriptor || descriptor.path !== path || !allowedActions.includes(descriptor.action)) {
    throw new Error(`Publish attempt ${label} association has no matching operation descriptor`)
  }
  return gitRepositoryPathIdentity(path)
}

/** Prove that every persisted cleanup association belongs to one descriptor. */
export function assertPublishAttemptAssociationClosure(attempt: Doc<"publishAttempts">) {
  const descriptors = descriptorMap(attempt)
  const coveredDescriptorIdentities = new Set<string>()
  const explorerById = new Map<string, NonNullable<typeof attempt.explorerAssociations>[number]>()
  for (const association of attempt.explorerAssociations ?? []) {
    explorerById.set(String(association.opId), association)
    coveredDescriptorIdentities.add(
      requireDescriptor(descriptors, association.repoPath, ["create", "update", "delete"], "explorer"),
    )
  }
  for (const association of attempt.mediaAssociations) {
    coveredDescriptorIdentities.add(requireDescriptor(descriptors, association.repoPath, ["create", "update"], "media"))
  }
  for (const association of attempt.documentAssociations) {
    coveredDescriptorIdentities.add(
      requireDescriptor(descriptors, association.repoPath, ["create", "update"], "document"),
    )
  }
  if (attempt.explorerAssociations !== undefined) {
    for (const association of attempt.deleteAssociations) {
      const explorer = explorerById.get(String(association.opId))
      if (!explorer) throw new Error("Publish attempt delete association has no owning explorer association")
      requireDescriptor(descriptors, explorer.repoPath, ["delete"], "delete")
    }
  }
  // Exact explorer associations were introduced with attempt-scoped
  // cleanup. Older attempts can only prove their path when the row is read
  // during continuation; new attempts must close the descriptor set now.
  if (attempt.explorerAssociations !== undefined && coveredDescriptorIdentities.size !== descriptors.size) {
    throw new Error("Publish attempt operation descriptor has no owning persisted association")
  }
}

/** Prove every association has the immutable cleanup decision it needs. */
export function assertPublishAttemptOutcomeClosure(attempt: Doc<"publishAttempts">, outcomePaths: ReadonlySet<string>) {
  assertPublishAttemptAssociationClosure(attempt)
  const requireOutcome = (path: string, label: string) => {
    if (!outcomePaths.has(path)) {
      throw new Error(`Publish attempt ${label} association has no persisted cleanup outcome`)
    }
  }
  for (const association of attempt.explorerAssociations ?? []) requireOutcome(association.repoPath, "explorer")
  for (const association of attempt.mediaAssociations) requireOutcome(association.repoPath, "media")
  for (const association of attempt.documentAssociations) requireOutcome(association.repoPath, "document")
}
