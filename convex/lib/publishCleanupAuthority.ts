import type { Doc } from "../_generated/dataModel"

const SHA_PATTERN = /^[0-9a-f]{40}$/

type CleanupOutcome = {
  disposition: "finalize" | "restore" | "discard"
}

/**
 * Derive cleanup authority exclusively from the lane's live lifecycle.
 * Call this before any cleanup mutation so a stale or corrupt durable plan
 * cannot partially apply under authority that no longer exists.
 */
export function assertCleanupAuthorityForLane(
  lane: Doc<"publishBranches">,
  authoritySha: string | undefined,
  pathOutcomes: CleanupOutcome[],
) {
  if (lane.status === "closed") {
    if (authoritySha !== undefined || pathOutcomes.some((outcome) => outcome.disposition !== "restore")) {
      throw new Error("Closed publish cleanup requires no authority and restore-only outcomes")
    }
    return { kind: "closed" } as const
  }

  if (lane.status === "merged") {
    if (
      lane.mergeVerificationState !== "pending" ||
      !lane.mergeCommitSha ||
      !SHA_PATTERN.test(lane.mergeCommitSha) ||
      authoritySha !== lane.mergeCommitSha
    ) {
      throw new Error("Merged publish cleanup requires the lane's pending immutable merge authority")
    }
    return { kind: "merged", authoritySha: lane.mergeCommitSha } as const
  }

  throw new Error("Publish cleanup requires a closed or merged lane")
}
