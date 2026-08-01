import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { recoverPublishAttempt } from "@/app/api/github/publish-ops/route"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { createGitHubClient } from "@/lib/github"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
const SHA_PATTERN = /^[0-9a-f]{40}$/

export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Cross-origin lifecycle sync is not allowed" }, { status: 403 })
  }

  try {
    const { projectId, laneId, prNumber, headBranch, baseBranch } = (await request.json()) as {
      projectId?: string
      laneId?: string
      prNumber?: number
      headBranch?: string
      baseBranch?: string
    }
    if (!projectId || !laneId || !Number.isInteger(prNumber) || !headBranch || !baseBranch) {
      return NextResponse.json({ error: "Missing or invalid lifecycle sync identity" }, { status: 400 })
    }

    const serverQueryToken = await mintServerQueryToken()
    const project = await convex.query(api.projects.get, {
      id: projectId as Id<"projects">,
      serverQueryToken,
    })
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

    const auth = await resolveRouteAuth(project, "editor")
    const { actingUserId, projectAccessToken, githubToken: token } = auth
    const owner = project.repoOwner
    const repo = project.repoName
    const expectedRepoFullName = `${owner}/${repo}`.toLowerCase()
    const octokit = createGitHubClient(token)
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber! })
    const mergeCommitSha = pr.merge_commit_sha ?? undefined
    const baseRepoFullName = pr.base?.repo?.full_name
    const headRepoFullName = pr.head?.repo?.full_name
    const identityMatches =
      baseRepoFullName?.toLowerCase() === expectedRepoFullName &&
      headRepoFullName?.toLowerCase() === expectedRepoFullName &&
      pr.base?.ref === baseBranch &&
      pr.head?.ref === headBranch
    if (!identityMatches) {
      return NextResponse.json(
        { error: "GitHub pull request identity does not match the publish lane" },
        { status: 409 },
      )
    }
    if (pr.merged && !SHA_PATTERN.test(mergeCommitSha ?? "")) {
      return NextResponse.json({ error: "GitHub returned no valid merge commit authority" }, { status: 502 })
    }

    const recorded = await convex.mutation(api.githubWebhook.recordVerifiedPullRequestState, {
      laneId: laneId as Id<"publishBranches">,
      projectId: project._id,
      prNumber: prNumber!,
      repoOwner: owner,
      repoName: repo,
      baseRepoFullName: baseRepoFullName!,
      baseBranch,
      headRepoFullName: headRepoFullName!,
      headBranch,
      state: pr.state === "open" ? "open" : "closed",
      merged: pr.merged,
      mergeCommitSha,
      serverQueryToken,
    })

    const recordedState = recorded as { verificationState?: string; verificationPending?: boolean }
    let verificationPending =
      recordedState.verificationPending === true || (pr.merged && recordedState.verificationState !== "complete")
    if (pr.merged || pr.state === "closed") {
      const queryAuth = { userId: actingUserId, projectAccessToken }
      const attempt = pr.merged
        ? await convex.query(api.publishAttempts.getActiveForProject, {
            projectId: project._id,
            ...queryAuth,
          })
        : await convex.query(api.publishAttempts.getNewestUnresolvedForLane, {
            projectId: project._id,
            laneId: laneId as Id<"publishBranches">,
            ...queryAuth,
          })
      if (attempt) {
        const recovery = await recoverPublishAttempt({
          convex,
          attempt,
          projectId: project._id,
          token,
          owner,
          repo,
          serverQueryToken,
          actingUserId,
          projectAccessToken,
        })
        if (recovery.handled && recovery.response.status >= 400) {
          const recoveryBody = (await recovery.response.clone().json()) as { error?: string }
          if (!recoveryBody.error?.includes("still finishing durable cleanup")) return recovery.response
        }
        // One request dispatches exactly the newest unresolved attempt. The
        // hook retries while true, allowing a reused lane to drain every
        // older attempt after this cleanup becomes terminal.
        verificationPending = true
      }
    }

    return NextResponse.json({
      state: pr.state,
      merged: pr.merged,
      mergeCommitSha,
      baseRef: pr.base.ref,
      baseRepoFullName,
      headRef: pr.head.ref,
      headRepoFullName,
      verificationPending,
    })
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const status = (error as { status?: number }).status
    if (status === 404) return NextResponse.json({ error: "PR not found" }, { status: 404 })
    console.error("Pull request lifecycle sync failed:", error)
    return NextResponse.json({ error: "Failed to synchronize pull request lifecycle" }, { status: 500 })
  }
}
