import { ConvexHttpClient } from "convex/browser"
import { redirect } from "next/navigation"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { mintProjectAccessToken } from "@/lib/project-access-token"
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

  let validatedProjectId: string | undefined
  let projectAccessToken: string | undefined
  if (projectId) {
    if (authUser && fetchAuthQuery) {
      const projects = await fetchAuthQuery(api.projects.listMyProjectsForRepo, {
        repoOwner: owner,
        repoName: repo,
      })
      const project = projects.find((entry) => entry._id === (projectId as Id<"projects">))
      if (project && (!branch || project.branch === branch)) {
        validatedProjectId = projectId
        projectAccessToken = await mintProjectAccessToken({
          projectId: project._id,
          userId: project.userId,
          repoOwner: project.repoOwner,
          repoName: project.repoName,
          branch: project.branch,
        })
      }
    } else if (patUserId) {
      const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
      const projects = await convex.query(api.projects.getByRepo, {
        userId: patUserId,
        repoOwner: owner,
        repoName: repo,
      })
      const project = projects.find((entry: { _id: string; branch: string; userId: string; repoOwner: string; repoName: string }) => entry._id === (projectId as Id<"projects">))
      if (project && (!branch || project.branch === branch)) {
        validatedProjectId = projectId
        projectAccessToken = await mintProjectAccessToken({
          projectId: project._id,
          userId: project.userId,
          repoOwner: project.repoOwner,
          repoName: project.repoName,
          branch: project.branch,
        })
      }
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
