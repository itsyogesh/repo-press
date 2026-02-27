import { redirect } from "next/navigation"
import { getGitHubToken } from "@/lib/auth-server"
import { HistoryClient } from "./history-client"

interface PageProps {
  params: Promise<{ owner: string; repo: string }>
}

export default async function HistoryPage({ params }: PageProps) {
  const { owner, repo } = await params
  const token = await getGitHubToken()
  if (!token) {
    redirect("/login")
  }

  return <HistoryClient owner={owner} repo={repo} />
}
