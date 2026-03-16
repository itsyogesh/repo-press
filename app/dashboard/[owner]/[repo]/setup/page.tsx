import { redirect } from "next/navigation"
import { RepoSetupForm } from "@/components/repo-setup-form"
import { api } from "@/convex/_generated/api"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { detectFramework } from "@/lib/framework-detector"
import { getRepoBranches } from "@/lib/github"
import { resolveRepoRole } from "@/lib/github-permissions"
import { fetchRepoConfig, type ConfigErrorType } from "@/lib/repopress/config"
import { syncProjectsServerSide } from "@/lib/sync-projects"

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

  // Resolve acting user
  const authUser = fetchAuthQuery ? await fetchAuthQuery(api.auth.getCurrentUser).catch(() => null) : null
  const patUserId = !authUser ? await getPatAuthUserId(token) : null
  const actingUserId = (authUser?._id as string | undefined) ?? patUserId

  // Resolve role + default branch via full 4-tier fallback (including repoAccessCache)
  const {
    role: repoRole,
    defaultBranch: resolvedDefaultBranch,
    defaultBranchInferred: branchInferredFromProbe,
  } = await resolveRepoRole(token, owner, repo, actingUserId)

  let branches: any[] = []
  let defaultBranch = resolvedDefaultBranch || "main"
  // Branch is inferred if the probe guessed it OR if resolveRepoRole returned null
  let defaultBranchInferred = branchInferredFromProbe || !resolvedDefaultBranch

  try {
    branches = await getRepoBranches(token, owner, repo)
    // Fallback if getRepoRole returned null (403 on org repos)
    if (!resolvedDefaultBranch) {
      const hasMain = branches.find((b: any) => b.name === "main")
      const hasMaster = branches.find((b: any) => b.name === "master")
      defaultBranch = hasMain ? "main" : hasMaster ? "master" : branches[0]?.name || "main"
      defaultBranchInferred = true
    }
  } catch (error) {
    console.error("Error fetching branches:", error)
  }

  // Check for repopress.config.json
  const { config: repoConfig, errorType, error: configError } = await fetchRepoConfig(token, owner, repo, defaultBranch)

  // Auto-redirect: if config exists and valid, sync and go to hub.
  // Skip when the branch is inferred — let the user verify it in the form first.
  if (repoConfig && actingUserId && !defaultBranchInferred) {
    try {
      await syncProjectsServerSide(token, owner, repo, defaultBranch, actingUserId)
      redirect(`/dashboard/${owner}/${repo}`)
    } catch {
      // Sync failed — fall through to render form with error context
    }
  }

  // Viewers cannot init — show read-only message
  const isWriter = repoRole === "owner" || repoRole === "editor"

  // Run framework detection
  const frameworkConfig = await detectFramework(token, owner, repo, defaultBranch)

  return (
    <div className="container mx-auto py-12 px-4">
      <RepoSetupForm
        owner={owner}
        repo={repo}
        branches={branches}
        defaultBranch={defaultBranch}
        defaultBranchInferred={defaultBranchInferred}
        frameworkConfig={frameworkConfig}
        repoConfig={repoConfig}
        configErrorType={errorType}
        configError={configError}
        isWriter={isWriter}
      />
    </div>
  )
}
