import { redirect } from "next/navigation"
import { RepoBreadcrumb } from "@/components/repo-breadcrumb"
import { RepoProjectHub } from "@/components/repo-project-hub"
import { api } from "@/convex/_generated/api"
import { getGitHubToken } from "@/lib/auth-server"
import { resolveRepoRole } from "@/lib/github-permissions"
import { fetchRepoConfig } from "@/lib/repopress/config"
import { createServerQueryContext, resolveActingUserId } from "@/lib/server-context"
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
  const actingUserId = await resolveActingUserId(token)

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

  const isWriter = repoRole === "owner" || repoRole === "editor"

  // Auto-sync from config if present
  const { config, sha: configSha } = await fetchRepoConfig(token, owner, repo, defaultBranch)
  let syncError: string | null = null

  if (config && actingUserId) {
    try {
      await syncProjectsServerSide(token, owner, repo, defaultBranch, actingUserId)
    } catch (e: any) {
      syncError = e.message || "Failed to sync projects from config"
    }
  }

  // Fetch all projects for this repo (repo-scoped, not user-scoped)
  const { convex, serverQueryToken } = await createServerQueryContext()
  const projects = await convex.query(api.projects.listProjectsForRepo, {
    repoOwner: owner,
    repoName: repo,
    serverQueryToken,
  })

  const hasConfig = !!config
  const configSynced = hasConfig && !syncError

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <RepoBreadcrumb owner={owner} repo={repo} />
      </div>
      <RepoProjectHub
        owner={owner}
        repo={repo}
        defaultBranch={defaultBranch}
        defaultBranchInferred={defaultBranchInferred || !resolvedDefaultBranch}
        projects={projects.map((p) => ({
          _id: p._id,
          userId: p.userId,
          name: p.name,
          branch: p.branch,
          contentRoot: p.contentRoot,
          detectedFramework: p.detectedFramework,
          contentType: p.contentType,
          frameworkSource: p.frameworkSource,
          configProjectId: p.configProjectId,
          configRemoved: p.configRemoved,
          configRemovedAt: p.configRemovedAt,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }))}
        hasConfig={hasConfig}
        configSynced={configSynced}
        syncError={syncError}
        isWriter={isWriter}
        role={repoRole}
        configJson={config ? JSON.stringify(config, null, 2) : null}
        configSha={configSha ?? null}
        actingUserId={actingUserId}
      />
    </div>
  )
}
