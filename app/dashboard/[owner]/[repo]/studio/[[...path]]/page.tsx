import { redirect } from "next/navigation"
import { StudioLayout } from "@/components/studio/studio-layout"
import { StudioPageThemeToggle } from "@/components/studio/studio-page-theme-toggle"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { getGitHubToken } from "@/lib/auth-server"
import { createGitHubClient, getFile } from "@/lib/github"
import { resolveRepoRole } from "@/lib/github-permissions"
import { resolveProjectAccessRole } from "@/lib/project-access-role"
import { mintProjectAccessToken } from "@/lib/project-access-token"
import { createServerQueryContext, resolveActingUserId } from "@/lib/server-context"
import { projectMatchesRoute, selectStudioFallbackProject } from "@/lib/studio/project-route"

interface StudioPageProps {
  params: Promise<{
    owner: string
    repo: string
    path?: string[]
  }>
  searchParams: Promise<{
    branch?: string
    projectId?: string
    file?: string
  }>
}

export default async function StudioPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: StudioPageProps) {
  const [token, resolvedParams, resolvedSearchParams] = await Promise.all([
    getGitHubToken(),
    paramsPromise,
    searchParamsPromise,
  ])

  if (!token) redirect("/login")

  const { owner, repo, path } = resolvedParams
  const { branch, projectId: projectIdParam, file } = resolvedSearchParams
  const currentPath = file || (path ? path.join("/") : "")

  const actingUserId = await resolveActingUserId(token)
  const { convex, serverQueryToken } = await createServerQueryContext()

  // Batch 2: project lookups + role resolution run in parallel.
  // listProjectsForRepo always runs (eliminates the sequential fallback on the common path).
  const [requestedProject, repoProjects, { role: resolvedRole, defaultBranch }] = await Promise.all([
    projectIdParam
      ? convex.query(api.projects.get, { id: projectIdParam as Id<"projects">, serverQueryToken })
      : Promise.resolve(null),
    convex.query(api.projects.listProjectsForRepo, { repoOwner: owner, repoName: repo, serverQueryToken }),
    resolveRepoRole(token, owner, repo, actingUserId),
  ])

  // Effective branch: URL param wins, then API default, then "main"
  const currentBranch = branch || defaultBranch || "main"

  // Resolve project: try the specific project first, then fall back to repo-level lookup
  let project: Doc<"projects"> | null = null
  if (
    requestedProject &&
    projectMatchesRoute(requestedProject, owner, repo, currentBranch) &&
    actingUserId &&
    requestedProject.userId === actingUserId
  ) {
    project = requestedProject
  }
  if (!project) {
    project = selectStudioFallbackProject(repoProjects, currentBranch)
  }

  // Ownership check happens AFTER final project is selected so the upgrade applies
  // regardless of whether the project came from the specific lookup or the fallback.
  const repoRole = resolveProjectAccessRole({
    actingUserId,
    projectOwnerId: project?.userId ?? null,
    resolvedRepoRole: resolvedRole,
  })

  if (!repoRole) {
    redirect("/dashboard")
  }

  // Always mint projectAccessToken with role (fixes OAuth bug)
  const projectAccessToken =
    project && actingUserId
      ? await mintProjectAccessToken({
          projectId: project._id,
          userId: actingUserId,
          repoOwner: project.repoOwner,
          repoName: project.repoName,
          branch: project.branch,
          role: repoRole,
        })
      : undefined

  // Cache the permission in Convex (best-effort, non-critical)
  if (actingUserId && projectAccessToken) {
    try {
      const octokit = createGitHubClient(token)
      const { data: ghUser } = await octokit.users.getAuthenticated()
      await convex.mutation(api.repoAccessCache.upsert, {
        repoOwner: owner,
        repoName: repo,
        userId: actingUserId,
        githubUsername: ghUser.login,
        role: repoRole,
        projectAccessToken,
      })
    } catch {
      // Non-critical: cache miss just means next action will re-check
    }
  }

  const contentRoot = project?.contentRoot || ""

  // Fetch initial file content server-side (fast for small files).
  // The file tree is deferred to client-side to avoid blocking on large repos.
  let fileData = null
  try {
    if (currentPath) {
      fileData = await getFile(token, owner, repo, currentPath, currentBranch)
    }
  } catch {
    // Non-critical: editor opens with empty content; user can reload from the file tree
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="shrink-0 border-b bg-background">
        <div className="w-full px-2 sm:px-3 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">
              {owner}/{repo}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <StudioPageThemeToggle />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <StudioLayout
          tree={[]}
          initialFile={fileData}
          owner={owner}
          repo={repo}
          branch={currentBranch}
          currentPath={currentPath}
          projectId={project?._id}
          projectAccessToken={projectAccessToken}
          contentRoot={contentRoot}
          role={repoRole}
        />
      </div>
    </div>
  )
}
