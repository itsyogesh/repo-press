import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getRepoBranches } from "@/lib/github"
import { RepoSetupForm } from "@/components/repo-setup-form"
import { cookies } from "next/headers"

interface SetupPageProps {
  params: Promise<{
    owner: string
    repo: string
  }>
}

export default async function SetupPage({ params }: SetupPageProps) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const cookieStore = await cookies()
  const pat = cookieStore.get("github_pat")?.value
  const token = session?.provider_token || pat

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
