import { ConvexHttpClient } from "convex/browser"
import { redirect } from "next/navigation"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { getRepoRole } from "@/lib/github-permissions"
import { mintProjectAccessToken, mintServerQueryToken } from "@/lib/project-access-token"
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
  const authUser = fetchAuthQuery ? await fetchAuthQuery(api.auth.getCurrentUser).catch(() => null) : null
  const patUserId = !authUser ? await getPatAuthUserId(token) : null
  const actingUserId = (authUser?._id as string | undefined) ?? patUserId

  let validatedProjectId: string | undefined
  let projectAccessToken: string | undefined
  if (projectId && actingUserId) {
    // Unified server-side lookup (works for both OAuth and PAT)
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
    const serverQueryToken = await mintServerQueryToken()
    const projects = await convex.query(api.projects.listProjectsForRepo, {
      repoOwner: owner,
      repoName: repo,
      serverQueryToken,
    })
    const project = projects.find((entry) => entry._id === (projectId as Id<"projects">))
    if (project && (!branch || project.branch === branch)) {
      // Resolve role: try GitHub API, fall back to project ownership
      const githubRole = await getRepoRole(token, owner, repo)
      const repoRole = githubRole ?? (project.userId === actingUserId ? "owner" as const : null)
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
