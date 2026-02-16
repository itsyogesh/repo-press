import { redirect } from "next/navigation"
import { RepoSetupForm } from "@/components/repo-setup-form"
import { getGitHubToken } from "@/lib/auth-server"
import { detectFramework } from "@/lib/framework-detector"
import { getRepoBranches } from "@/lib/github"

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
  let branches: any[] = []
  let defaultBranch = "main"

  try {
    branches = await getRepoBranches(token, owner, repo)
    const hasMain = branches.find((b: any) => b.name === "main")
    const hasMaster = branches.find((b: any) => b.name === "master")
    defaultBranch = hasMain ? "main" : hasMaster ? "master" : branches[0]?.name || "main"
  } catch (error) {
    console.error("Error fetching branches:", error)
  }

  // Run framework detection
  const frameworkConfig = await detectFramework(token, owner, repo, defaultBranch)

  return (
    <div className="container mx-auto py-12 px-4">
      <RepoSetupForm
        owner={owner}
        repo={repo}
        branches={branches}
        defaultBranch={defaultBranch}
        frameworkConfig={frameworkConfig}
      />
    </div>
  )
}
