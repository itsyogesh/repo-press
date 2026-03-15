import { ConvexHttpClient } from "convex/browser"
import { redirect } from "next/navigation"
import { RepoProjectHub } from "@/components/repo-project-hub"
import { api } from "@/convex/_generated/api"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { resolveRepoRole } from "@/lib/github-permissions"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { fetchRepoConfig } from "@/lib/repopress/config"
import { syncProjectsServerSide } from "@/lib/sync-projects"

interface RepoPageProps {
  params: Promise<{
    owner: string
    repo: string
  }>
}

export default async function RepoPage({ params }: RepoPageProps) {
  const token = await getGitHubToken()

  if (!token) {
    redirect("/login")
  }

  const { owner, repo } = await params

  // Resolve acting user (OAuth or PAT)
  const authUser = fetchAuthQuery ? await fetchAuthQuery(api.auth.getCurrentUser).catch(() => null) : null
  const patUserId = !authUser ? await getPatAuthUserId(token) : null
  const actingUserId = (authUser?._id as string | undefined) ?? patUserId

  // Resolve role + default branch via full 4-tier fallback (including repoAccessCache)
  const {
    role: repoRole,
    defaultBranch: resolvedDefaultBranch,
    defaultBranchInferred,
  } = await resolveRepoRole(token, owner, repo, actingUserId)
  const defaultBranch = resolvedDefaultBranch || "main"

  if (!repoRole && !actingUserId) {
    redirect("/login")
  }
  if (!repoRole) {
    redirect("/dashboard")
  }

  // Auto-sync from config if present
  const { config, errorType } = await fetchRepoConfig(token, owner, repo, defaultBranch)
  let syncError: string | null = null

  if (config && actingUserId) {
    try {
      await syncProjectsServerSide(token, owner, repo, defaultBranch, actingUserId)
    } catch (e: any) {
      syncError = e.message || "Failed to sync projects from config"
    }
  }

  // Fetch all projects for this repo (repo-scoped, not user-scoped)
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
  const serverQueryToken = await mintServerQueryToken()
  const projects = await convex.query(api.projects.listProjectsForRepo, {
    repoOwner: owner,
    repoName: repo,
    serverQueryToken,
  })

  const isWriter = repoRole === "owner" || repoRole === "editor"
  const hasConfig = !!config
  const configSynced = hasConfig && !syncError

  return (
    <div className="container mx-auto py-8 px-4">
      <RepoProjectHub
        owner={owner}
        repo={repo}
        defaultBranch={defaultBranch}
        defaultBranchInferred={defaultBranchInferred || !resolvedDefaultBranch}
        projects={projects.map((p) => ({
          _id: p._id,
          name: p.name,
          branch: p.branch,
          contentRoot: p.contentRoot,
          detectedFramework: p.detectedFramework,
          contentType: p.contentType,
          frameworkSource: p.frameworkSource,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }))}
        hasConfig={hasConfig}
        configSynced={configSynced}
        syncError={syncError}
        isWriter={isWriter}
        role={repoRole}
      />
    </div>
  )
}
