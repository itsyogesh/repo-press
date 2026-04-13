import { redirect } from "next/navigation"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getGitHubToken } from "@/lib/auth-server"
import { resolveRepoRole } from "@/lib/github-permissions"
import { resolveProjectAccessRole } from "@/lib/project-access-role"
import { mintProjectAccessToken } from "@/lib/project-access-token"
import { createServerQueryContext, resolveActingUserId } from "@/lib/server-context"
import { HistoryClient } from "./history-client"

interface PageProps {
  params: Promise<{ owner: string; repo: string }>
  searchParams: Promise<{ branch?: string; projectId?: string }>
}

export default async function HistoryPage({ params, searchParams }: PageProps) {
  const { owner, repo } = await params
  const { branch, projectId } = await searchParams
  const token = await getGitHubToken()
  if (!token) {
    redirect("/login")
  }
  const actingUserId = await resolveActingUserId(token)

  let validatedProjectId: string | undefined
  let projectAccessToken: string | undefined
  if (projectId && actingUserId) {
    // Unified server-side lookup (works for both OAuth and PAT)
    const { convex, serverQueryToken } = await createServerQueryContext()
    const projects = await convex.query(api.projects.listProjectsForRepo, {
      repoOwner: owner,
      repoName: repo,
      serverQueryToken,
    })
    const project = projects.find((entry) => entry._id === (projectId as Id<"projects">))
    if (project && (!branch || project.branch === branch)) {
      const { role: resolvedRole } = await resolveRepoRole(token, owner, repo, actingUserId)
      const repoRole = resolveProjectAccessRole({
        actingUserId,
        projectOwnerId: project.userId,
        resolvedRepoRole: resolvedRole,
      })
      if (!repoRole) {
        redirect("/dashboard")
      }
      validatedProjectId = projectId
      projectAccessToken = await mintProjectAccessToken({
        projectId: project._id,
        userId: actingUserId,
        repoOwner: project.repoOwner,
        repoName: project.repoName,
        branch: project.branch,
        role: repoRole,
      })
    }
  }

  return (
    <HistoryClient
      owner={owner}
      repo={repo}
      branch={branch}
      projectId={validatedProjectId}
      projectAccessToken={projectAccessToken}
    />
  )
}
