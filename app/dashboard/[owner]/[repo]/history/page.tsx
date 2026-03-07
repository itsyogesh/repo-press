import { redirect } from "next/navigation"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { fetchAuthQuery, getGitHubToken } from "@/lib/auth-server"
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
  if (!fetchAuthQuery) {
    return <HistoryClient owner={owner} repo={repo} branch={branch} projectId={undefined} />
  }

  const authUser = await fetchAuthQuery(api.auth.getCurrentUser).catch(() => null)
  if (!authUser?._id) {
    return <HistoryClient owner={owner} repo={repo} branch={branch} projectId={undefined} />
  }

  let validatedProjectId: string | undefined
  if (projectId) {
    const projects = await fetchAuthQuery(api.projects.listMyProjectsForRepo, {
      repoOwner: owner,
      repoName: repo,
    })
    const project = projects.find((entry) => entry._id === (projectId as Id<"projects">))
    if (project && (!branch || project.branch === branch)) {
      validatedProjectId = projectId
    }
  }

  return <HistoryClient owner={owner} repo={repo} branch={branch} projectId={validatedProjectId} />
}
