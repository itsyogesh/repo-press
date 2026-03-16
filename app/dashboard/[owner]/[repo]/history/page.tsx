import { ConvexHttpClient } from "convex/browser"
import { redirect } from "next/navigation"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { getRepoRole, probeRepoReadAccess } from "@/lib/github-permissions"
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
      // Resolve role: GitHub API → ownership → cache → content probe
      const { role: githubRole } = await getRepoRole(token, owner, repo)
      let repoRole: "owner" | "editor" | "viewer" | null = githubRole ?? (project.userId === actingUserId ? "owner" : null)
      if (!repoRole) {
        try {
          const cached = await convex.query(api.repoAccessCache.getForUserPublic, {
            repoOwner: owner,
            repoName: repo,
            userId: actingUserId,
            serverQueryToken,
          })
          if (cached) repoRole = cached.role as "owner" | "editor" | "viewer"
        } catch {
          // Cache lookup failed
        }
        if (!repoRole) {
          repoRole = await probeRepoReadAccess(token, owner, repo)
        }
      }
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
