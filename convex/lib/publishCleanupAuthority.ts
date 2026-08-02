import { assertCanonicalPublishOperationPath, gitRepositoryPathIdentity } from "../../lib/git-path-policy"
import type { Doc, Id } from "../_generated/dataModel"
import {
  assertPublishAttemptAssociationClosure,
  assertPublishAttemptAssociationSnapshotShapes,
  assertPublishAttemptOutcomeClosure,
} from "./publishAttemptClosure"

const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^[0-9a-f]{64}$/

type CleanupOutcome = {
  path: string
  disposition: "finalize" | "restore" | "discard"
  finalBlobSha?: string
}

type CleanupPlan = {
  projectId: Id<"projects">
  laneId: Id<"publishBranches">
  attemptId: Id<"publishAttempts">
  cleanupId?: Id<"publishAttemptCleanups">
  authoritySha?: string
  pathOutcomes: CleanupOutcome[]
}

function assertUniqueReferences(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Publish cleanup plan contains duplicate ${label}`)
}

/**
 * Validate one complete cleanup plan against its live project, lane, and
 * attempt. Both enqueue and every active continuation call this before any
 * row, storage, cursor, or scheduler write.
 */
export function assertValidPublishCleanupPlan({
  project,
  lane,
  attempt,
  plan,
  stage,
}: {
  project: Doc<"projects"> | null
  lane: Doc<"publishBranches"> | null
  attempt: Doc<"publishAttempts"> | null
  plan: CleanupPlan
  stage: "enqueue" | "continuation"
}) {
  if (
    !project ||
    !lane ||
    !attempt ||
    project._id !== plan.projectId ||
    lane._id !== plan.laneId ||
    attempt._id !== plan.attemptId ||
    lane.projectId !== project._id ||
    attempt.projectId !== project._id ||
    attempt.publishBranchId !== lane._id ||
    !attempt.branchName ||
    lane.branchName !== attempt.branchName
  ) {
    throw new Error("Publish cleanup plan references do not exactly match its live project, lane, attempt, and branch")
  }
  if (stage === "continuation" && (!plan.cleanupId || attempt.cleanupId !== plan.cleanupId)) {
    throw new Error("Publish cleanup plan does not exactly match its active attempt")
  }
  if (!SHA_PATTERN.test(attempt.expectedHeadSha) || !DIGEST_PATTERN.test(attempt.planDigest)) {
    throw new Error("Publish cleanup attempt contains invalid immutable Git authority")
  }

  let mode: { kind: "closed" } | { kind: "merged"; authoritySha: string }
  if (lane.status === "closed") {
    if (
      (plan.authoritySha !== undefined && !SHA_PATTERN.test(plan.authoritySha)) ||
      plan.pathOutcomes.some((outcome) => outcome.disposition !== "restore")
    ) {
      throw new Error("Closed publish cleanup requires restore-only outcomes and a valid optional base authority")
    }
    mode = { kind: "closed" }
  } else if (lane.status === "merged") {
    if (!lane.baseBranch || lane.baseBranch.trim().length === 0) {
      throw new Error("Merged publish cleanup requires a nonempty base branch")
    }
    if (
      lane.mergeVerificationState !== "pending" ||
      !lane.mergeCommitSha ||
      !SHA_PATTERN.test(lane.mergeCommitSha) ||
      plan.authoritySha !== lane.mergeCommitSha
    ) {
      throw new Error("Merged publish cleanup requires the lane's pending immutable merge authority")
    }
    mode = { kind: "merged", authoritySha: lane.mergeCommitSha }
  } else {
    throw new Error("Publish cleanup requires a closed or merged lane")
  }

  if (stage === "continuation" && attempt.status !== "cleanup_pending") {
    throw new Error("Publish cleanup continuation requires its exact active attempt")
  }
  const mergedWithoutRecordedCommit =
    mode.kind === "merged" &&
    !attempt.commitSha &&
    ((stage === "enqueue" && attempt.status === "committing") ||
      (stage === "continuation" && attempt.status === "cleanup_pending"))
  if (
    stage === "enqueue" &&
    !mergedWithoutRecordedCommit &&
    attempt.status !== "committed" &&
    attempt.status !== "reconciled" &&
    attempt.status !== "cleanup_pending" &&
    attempt.status !== "cleaned"
  ) {
    throw new Error(`Cannot resolve cleanup for a ${attempt.status} publish attempt`)
  }
  if (!mergedWithoutRecordedCommit && (!attempt.commitSha || !SHA_PATTERN.test(attempt.commitSha))) {
    throw new Error("Publish cleanup requires the attempt's committed SHA")
  }
  if (attempt.commitSha !== undefined && !SHA_PATTERN.test(attempt.commitSha)) {
    throw new Error("Publish cleanup attempt commit must be a 40-hex SHA")
  }

  const descriptors = attempt.operationDescriptors
  if (!descriptors || descriptors.length === 0 || attempt.explorerAssociations === undefined) {
    throw new Error("Publish cleanup plan requires exact operation descriptors and associations")
  }
  const descriptorByIdentity = new Map<string, (typeof descriptors)[number]>()
  for (const descriptor of descriptors) {
    assertCanonicalPublishOperationPath(descriptor.path)
    const identity = gitRepositoryPathIdentity(descriptor.path)
    if (descriptorByIdentity.has(identity)) throw new Error("Publish cleanup plan contains duplicate descriptor paths")
    descriptorByIdentity.set(identity, descriptor)
    if (descriptor.action !== "create" && descriptor.action !== "update" && descriptor.action !== "delete") {
      throw new Error("Publish cleanup plan contains an invalid descriptor action")
    }
    if (descriptor.action === "delete") {
      if ("expectedBlobSha" in descriptor && descriptor.expectedBlobSha !== undefined) {
        throw new Error("Publish cleanup delete descriptor must not carry blob evidence")
      }
    } else if (!SHA_PATTERN.test(descriptor.expectedBlobSha)) {
      throw new Error("Publish cleanup write descriptor requires a 40-hex blob SHA")
    }
  }

  if (plan.pathOutcomes.length !== descriptorByIdentity.size) {
    throw new Error("Publish cleanup outcomes must exactly match the attempt descriptor paths")
  }
  const outcomePaths = new Set<string>()
  for (const outcome of plan.pathOutcomes) {
    if (outcome.disposition !== "finalize" && outcome.disposition !== "restore" && outcome.disposition !== "discard") {
      throw new Error("Publish cleanup plan contains a disposition that is not allowed by its lane mode")
    }
    assertCanonicalPublishOperationPath(outcome.path)
    const identity = gitRepositoryPathIdentity(outcome.path)
    const descriptor = descriptorByIdentity.get(identity)
    if (!descriptor || descriptor.path !== outcome.path || outcomePaths.has(identity)) {
      throw new Error("Publish cleanup outcomes must exactly match unique attempt descriptor paths")
    }
    outcomePaths.add(identity)
    if (outcome.disposition === "restore") {
      if (outcome.finalBlobSha !== undefined && (!plan.authoritySha || !SHA_PATTERN.test(outcome.finalBlobSha))) {
        throw new Error("A restored publish path needs a valid authority before carrying baseline blob evidence")
      }
      continue
    }
    if (outcome.disposition === "discard") {
      if (outcome.finalBlobSha !== undefined && (mode.kind !== "merged" || !SHA_PATTERN.test(outcome.finalBlobSha))) {
        throw new Error("A discarded publish path can carry only valid merged final-tree blob evidence")
      }
      continue
    }
    if (descriptor.action === "delete") {
      if (outcome.finalBlobSha !== undefined) {
        throw new Error("A finalized delete must not carry final blob evidence")
      }
      continue
    }
    if (!outcome.finalBlobSha || !SHA_PATTERN.test(outcome.finalBlobSha)) {
      throw new Error("A finalized write requires 40-hex final blob evidence")
    }
    if (outcome.finalBlobSha !== descriptor.expectedBlobSha) {
      throw new Error("A finalized write blob must match the attempt descriptor")
    }
  }
  if (outcomePaths.size !== descriptorByIdentity.size) {
    throw new Error("Publish cleanup outcomes must exactly match the attempt descriptor paths")
  }

  assertUniqueReferences(attempt.opIds.map(String), "explorer operation references")
  assertUniqueReferences(
    attempt.explorerAssociations.map((association) => String(association.opId)),
    "explorer associations",
  )
  assertUniqueReferences(
    attempt.mediaAssociations.map((association) => String(association.mediaOpId)),
    "media associations",
  )
  assertUniqueReferences(
    attempt.documentAssociations.map((association) => String(association.documentId)),
    "document associations",
  )
  assertUniqueReferences(
    attempt.deleteAssociations.map((association) => String(association.opId)),
    "delete associations",
  )

  assertPublishAttemptAssociationSnapshotShapes(attempt)
  assertPublishAttemptAssociationClosure(attempt)
  assertPublishAttemptOutcomeClosure(attempt, new Set(plan.pathOutcomes.map((outcome) => outcome.path)))
  return mode
}
