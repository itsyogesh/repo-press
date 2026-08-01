import { v } from "convex/values"
import { verifyServerQueryToken } from "../lib/project-access-token"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { mutation } from "./_generated/server"
import { invalidateClosedLaneSync } from "./lib/laneInvalidation"
import { recordMergedLaneAuthority } from "./lib/publishBranchMerge"

const identityValidators = {
  prNumber: v.number(),
  repoOwner: v.string(),
  repoName: v.string(),
  baseRepoFullName: v.string(),
  baseBranch: v.string(),
  headRepoFullName: v.string(),
  headBranch: v.string(),
}

type PullRequestIdentity = {
  prNumber: number
  repoOwner: string
  repoName: string
  baseRepoFullName: string
  baseBranch: string
  headRepoFullName: string
  headBranch: string
}

async function assertLaneIdentity(
  ctx: Pick<MutationCtx, "db">,
  lane: Doc<"publishBranches">,
  identity: PullRequestIdentity,
) {
  const project = await ctx.db.get(lane.projectId)
  const projectFullName = project && `${project.repoOwner}/${project.repoName}`.toLowerCase()
  if (
    !project ||
    project.repoOwner.toLowerCase() !== identity.repoOwner.toLowerCase() ||
    project.repoName.toLowerCase() !== identity.repoName.toLowerCase() ||
    identity.baseRepoFullName.toLowerCase() !== projectFullName ||
    identity.headRepoFullName.toLowerCase() !== projectFullName ||
    lane.prNumber !== identity.prNumber ||
    lane.baseBranch !== identity.baseBranch ||
    lane.branchName !== identity.headBranch
  ) {
    throw new Error("Pull request identity does not match the RepoPress publish lane")
  }
  return project
}

async function findWebhookLane(ctx: Pick<MutationCtx, "db">, identity: PullRequestIdentity) {
  const lane = await ctx.db
    .query("publishBranches")
    .withIndex("by_repo_pr_head_base", (q) =>
      q
        .eq("repoOwner", identity.repoOwner)
        .eq("repoName", identity.repoName)
        .eq("prNumber", identity.prNumber)
        .eq("branchName", identity.headBranch)
        .eq("baseBranch", identity.baseBranch),
    )
    .first()
  if (!lane) return null
  await assertLaneIdentity(ctx, lane, identity)
  return lane
}

async function closeLane(ctx: MutationCtx, lane: Doc<"publishBranches">, identity: PullRequestIdentity) {
  const project = await assertLaneIdentity(ctx, lane, identity)
  const closedLane = {
    ...lane,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    status: "closed" as const,
    laneInvalidationPending: true as const,
    laneCleanupAction: "restore_legacy" as const,
  }
  await ctx.db.patch(lane._id, {
    status: "closed",
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    laneInvalidationPending: true,
    laneCleanupAction: "restore_legacy",
    updatedAt: Date.now(),
  })
  return await invalidateClosedLaneSync(ctx, closedLane)
}

/** Signed GitHub webhook merge path, scoped by complete PR identity. */
export const handlePRMerged = mutation({
  args: {
    ...identityValidators,
    mergeCommitSha: v.string(),
    serverQueryToken: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await verifyServerQueryToken(args.serverQueryToken))) throw new Error("Unauthorized")
    const lane = await findWebhookLane(ctx, args)
    if (!lane) return
    await recordMergedLaneAuthority(ctx, lane, args)
  },
})

/** Signed GitHub webhook unmerged-close path, scoped by complete PR identity. */
export const handlePRClosed = mutation({
  args: { ...identityValidators, serverQueryToken: v.string() },
  handler: async (ctx, args) => {
    if (!(await verifyServerQueryToken(args.serverQueryToken))) throw new Error("Unauthorized")
    const lane = await findWebhookLane(ctx, args)
    if (!lane) return
    await closeLane(ctx, lane, args)
  },
})

/**
 * Authenticated status-sync command. The Next.js route reads GitHub first;
 * this server-token mutation binds that proof to one exact project lane.
 */
export const recordVerifiedPullRequestState = mutation({
  args: {
    laneId: v.id("publishBranches"),
    projectId: v.id("projects"),
    ...identityValidators,
    state: v.union(v.literal("open"), v.literal("closed")),
    merged: v.boolean(),
    mergeCommitSha: v.optional(v.string()),
    serverQueryToken: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await verifyServerQueryToken(args.serverQueryToken))) throw new Error("Unauthorized")
    const lane = await ctx.db.get(args.laneId as Id<"publishBranches">)
    if (!lane || lane.projectId !== args.projectId) throw new Error("Publish lane does not belong to the project")
    await assertLaneIdentity(ctx, lane, args)
    if (args.state === "open") return { state: "open" as const }
    if (args.merged) {
      if (!args.mergeCommitSha) throw new Error("Merged pull request is missing its commit authority")
      return await recordMergedLaneAuthority(ctx, lane, { ...args, mergeCommitSha: args.mergeCommitSha })
    }
    await closeLane(ctx, lane, args)
    return { state: "closed" as const }
  },
})
