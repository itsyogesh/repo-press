import { redirect } from "next/navigation"
import { getRepoBranches } from "@/lib/github"
import { RepoSetupForm } from "@/components/repo-setup-form"
import { getGitHubToken } from "@/lib/auth-server"

interface SetupPageProps {
  params: Promise<{
    owner: string
    repo: string
  }>
}

export default async function SetupPage({ params }: SetupPageProps) {
  const token = await getGitHubToken()

  if (!token) {
    redirect("/login")
  }

  const { owner, repo } = await params
  let branches = []
  let defaultBranch = "main"

  try {
    branches = await getRepoBranches(token, owner, repo)
    // Try to find master or main as default
    const hasMain = branches.find((b: any) => b.name === "main")
    const hasMaster = branches.find((b: any) => b.name === "master")
    defaultBranch = hasMain ? "main" : hasMaster ? "master" : branches[0]?.name || "main"
  } catch (error) {
    console.error("Error fetching branches:", error)
  }

  return (
    <div className="container mx-auto py-12 px-4">
      <RepoSetupForm owner={owner} repo={repo} branches={branches} defaultBranch={defaultBranch} />
    </div>
  )
}
