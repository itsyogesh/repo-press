import { ConvexHttpClient } from "convex/browser"
import { AlertCircle } from "lucide-react"
import { redirect } from "next/navigation"
import { StudioLayout } from "@/components/studio/studio-layout"
import { StudioPageThemeToggle } from "@/components/studio/studio-page-theme-toggle"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import type { FileTreeNode } from "@/lib/github"
import { createGitHubClient, getContentTree, getFile } from "@/lib/github"
import { getRepoRole } from "@/lib/github-permissions"
import { mintProjectAccessToken, mintServerQueryToken } from "@/lib/project-access-token"
import { projectMatchesRoute, selectStudioFallbackProject } from "@/lib/studio/project-route"

type Role = "owner" | "editor" | "viewer"

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

export default async function StudioPage({ params, searchParams }: StudioPageProps) {
  const token = await getGitHubToken()

  if (!token) {
    redirect("/login")
  }

  const { owner, repo, path } = await params
  const { branch, projectId: projectIdParam, file } = await searchParams
  const currentBranch = branch || "main"
  const currentPath = file || (path ? path.join("/") : "")
  const authUser = fetchAuthQuery ? await fetchAuthQuery(api.auth.getCurrentUser).catch(() => null) : null
  const patUserId = !authUser ? await getPatAuthUserId(token) : null
  const actingUserId = (authUser?._id as string | undefined) ?? patUserId

  // Check GitHub permissions on the repo
  const repoRole = await getRepoRole(token, owner, repo)
  if (!repoRole) {
    redirect("/dashboard")
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
  const serverQueryToken = await mintServerQueryToken()

  // Look up the project: prefer explicit projectId, fall back to repo+branch lookup.
  // Uses serverQueryToken for all paths (server already verified repoRole above).
  let project: Doc<"projects"> | null = null
  if (projectIdParam) {
    const requestedProject = await convex.query(api.projects.get, {
      id: projectIdParam as Id<"projects">,
      serverQueryToken,
    })
    if (projectMatchesRoute(requestedProject, owner, repo, currentBranch)) {
      project = requestedProject
    }
  }
  if (!project) {
    // Repo-scoped lookup: returns ALL projects for this repo (OAuth + PAT alike)
    const repoProjects = await convex.query(api.projects.listProjectsForRepo, {
      repoOwner: owner,
      repoName: repo,
      serverQueryToken,
    })
    project = selectStudioFallbackProject(repoProjects, currentBranch)
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

  // Cache the permission in Convex (best-effort, requires projectAccessToken)
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

  // Use project's contentRoot to scope file listing (falls back to repo root)
  const contentRoot = project?.contentRoot || ""

  let tree: FileTreeNode[] = []
  let fileData = null
  let error = null

  try {
    // Always fetch the full content tree (filtered to .md/.mdx files)
    tree = await getContentTree(token, owner, repo, currentBranch, contentRoot)

    // When a specific path is requested, fetch the file content
    if (currentPath) {
      fileData = await getFile(token, owner, repo, currentPath, currentBranch)
    }
  } catch (e) {
    console.error("Error fetching studio data:", e)
    error = "Failed to fetch repository data. Please try again later."
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

      {error ? (
        <div className="w-full px-2 sm:px-3 py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <StudioLayout
            tree={tree}
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
      )}
    </div>
  )
}
