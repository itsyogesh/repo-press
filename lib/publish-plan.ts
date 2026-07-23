import { createHash } from "node:crypto"

/**
 * Deterministic digest of a publish attempt's full intent: the lane, the
 * exact Git head it was planned against, and every operation's identity and
 * content hash. Two publish requests produce the same digest if and only if
 * they would commit the same changes onto the same head of the same branch.
 *
 * The digest is embedded in the publish commit message
 * (`RepoPress-Publish-Attempt: <digest>`), so a retry can prove whether a
 * previous attempt's commit landed without re-committing.
 */

export const PUBLISH_ATTEMPT_TRAILER = "RepoPress-Publish-Attempt"

export type PublishPlanOperation = {
  path: string
  action: "create" | "update" | "delete"
  /** sha256 hex of the operation content; null for deletes / blob-backed ops */
  contentDigest: string | null
}

export type PublishPlan = {
  branchName: string
  expectedHeadSha: string
  operations: PublishPlanOperation[]
  opIds: string[]
  mediaOpIds: string[]
  deleteAssociations: Array<{ opId: string; documentId: string; expectedUpdatedAt: number }>
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function computePublishPlanDigest(plan: PublishPlan): string {
  const canonical = {
    branchName: plan.branchName,
    expectedHeadSha: plan.expectedHeadSha,
    operations: [...plan.operations]
      .map((operation) => ({
        path: operation.path,
        action: operation.action,
        contentDigest: operation.contentDigest,
      }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.action.localeCompare(b.action))),
    opIds: [...plan.opIds].sort(),
    mediaOpIds: [...plan.mediaOpIds].sort(),
    deleteAssociations: [...plan.deleteAssociations]
      .map((association) => ({
        opId: association.opId,
        documentId: association.documentId,
        expectedUpdatedAt: association.expectedUpdatedAt,
      }))
      .sort((a, b) => (a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0)),
  }
  return sha256Hex(JSON.stringify(canonical))
}

export function formatPublishAttemptTrailer(planDigest: string): string {
  return `${PUBLISH_ATTEMPT_TRAILER}: ${planDigest}`
}

/**
 * True only when the message carries the attempt trailer as an EXACT line
 * (`RepoPress-Publish-Attempt: <digest>` with nothing else on the line). A
 * digest substring embedded in prose or another trailer does not count -
 * recovery must not adopt commits that merely mention the digest.
 */
export function commitMessageCarriesAttempt(message: string, planDigest: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(planDigest)) return false
  const expected = formatPublishAttemptTrailer(planDigest)
  return message.split(/\r?\n/).some((line) => line === expected)
}
