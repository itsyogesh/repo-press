import { redirect } from "next/navigation"
import { getGitHubToken } from "@/lib/auth-server"
import { HistoryClient } from "./history-client"

interface PageProps {
  params: Promise<{ owner: string; repo: string }>
  searchParams: Promise<{ branch?: string }>
}

export default async function HistoryPage({ params, searchParams }: PageProps) {
  const { owner, repo } = await params
  const { branch } = await searchParams
  const token = await getGitHubToken()
  if (!token) {
    redirect("/login")
  }

  return <HistoryClient owner={owner} repo={repo} branch={branch} />
}
