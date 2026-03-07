import { ConvexHttpClient } from "convex/browser"
import { redirect } from "next/navigation"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getGitHubToken } from "@/lib/auth-server"
import { projectMatchesRoute } from "@/lib/studio/project-route"
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

  let validatedProjectId: string | undefined
  if (projectId) {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
    const project = await convex.query(api.projects.get, { id: projectId as Id<"projects"> })
    if (projectMatchesRoute(project, owner, repo, branch)) {
      validatedProjectId = projectId
    }
  }

  return <HistoryClient owner={owner} repo={repo} branch={branch} projectId={validatedProjectId} />
}
