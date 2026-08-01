import type { Doc } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { scheduleLaneCleanupContinuation } from "./laneInvalidation"

const SHA_PATTERN = /^[0-9a-f]{40}$/

type MergeCtx = Pick<MutationCtx, "db" | "scheduler">

export function assertMergeCommitSha(sha: string) {
  if (!SHA_PATTERN.test(sha)) {
    throw new Error("Merged publish lane requires an exact 40-hex merge commit authority")
  }
}

/**
 * Record GitHub's immutable merged-PR authority without touching staged
 * content. Exact replay is idempotent; a different SHA is an integrity
 * conflict and a legacy merged row may be backfilled once.
 */
export async function recordMergedLaneAuthority(
  ctx: MergeCtx,
  lane: Doc<"publishBranches">,
  args: {
    mergeCommitSha: string
    repoOwner: string
    repoName: string
    prNumber: number
    baseRepoFullName: string
    baseBranch: string
    headRepoFullName: string
    headBranch: string
  },
) {
  assertMergeCommitSha(args.mergeCommitSha)
  const project = await ctx.db.get(lane.projectId)
  if (
    !project ||
    project.repoOwner.toLowerCase() !== args.repoOwner.toLowerCase() ||
    project.repoName.toLowerCase() !== args.repoName.toLowerCase() ||
    args.baseRepoFullName.toLowerCase() !== `${project.repoOwner}/${project.repoName}`.toLowerCase() ||
    lane.prNumber !== args.prNumber ||
    lane.baseBranch !== args.baseBranch ||
    args.headRepoFullName.toLowerCase() !== `${project.repoOwner}/${project.repoName}`.toLowerCase() ||
    lane.branchName !== args.headBranch
  ) {
    throw new Error("Merged pull request repository or head branch does not match the publish lane")
  }
  if (lane.mergeCommitSha && lane.mergeCommitSha !== args.mergeCommitSha) {
    throw new Error("Merged publish lane authority conflicts with the previously recorded authority")
  }
  if (
    lane.status === "merged" &&
    lane.mergeCommitSha === args.mergeCommitSha &&
    lane.mergeVerificationState === "complete"
  ) {
    return { reused: true as const, verificationState: "complete" as const }
  }

  const verificationState = lane.mergeVerificationState === "complete" ? "complete" : "pending"
  await ctx.db.patch(lane._id, {
    status: "merged",
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    mergeCommitSha: args.mergeCommitSha,
    mergeVerificationState: verificationState,
    laneInvalidationPending: true,
    laneCleanupAction: "finalize_legacy",
    updatedAt: Date.now(),
  })
  await scheduleLaneCleanupContinuation(
    ctx,
    {
      ...lane,
      status: "merged",
      repoOwner: project.repoOwner,
      repoName: project.repoName,
      mergeCommitSha: args.mergeCommitSha,
      mergeVerificationState: verificationState,
      laneInvalidationPending: true,
      laneCleanupAction: "finalize_legacy",
    },
    "finalize_legacy",
  )
  return { reused: Boolean(lane.mergeCommitSha), verificationState }
}
