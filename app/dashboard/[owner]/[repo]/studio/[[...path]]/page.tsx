import { ConvexHttpClient } from "convex/browser"
import type { Id } from "@/convex/_generated/dataModel"
import { AlertCircle } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ProjectSwitcher } from "@/components/studio/project-switcher"
import { StudioLayout } from "@/components/studio/studio-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { api } from "@/convex/_generated/api"
import { getGitHubToken } from "@/lib/auth-server"
import type { FileTreeNode } from "@/lib/github"
import { getContentTree, getFile } from "@/lib/github"

interface StudioPageProps {
  params: Promise<{
    owner: string
    repo: string
    path?: string[]
  }>
  searchParams: Promise<{
    branch?: string
    projectId?: string
  }>
}

export default async function StudioPage({ params, searchParams }: StudioPageProps) {
  const token = await getGitHubToken()

  if (!token) {
    redirect("/login")
  }

  const { owner, repo, path } = await params
  const { branch, projectId: projectIdParam } = await searchParams
  const currentBranch = branch || "main"
  const currentPath = path ? path.join("/") : ""

  // Look up the project: prefer explicit projectId, fall back to repo+branch lookup
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
  let project = null
  if (projectIdParam) {
    project = await convex.query(api.projects.get, { id: projectIdParam as Id<"projects"> })
  }
  if (!project) {
    project = await convex.query(api.projects.findByRepo, {
      repoOwner: owner,
      repoName: repo,
      branch: currentBranch,
    })
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
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">
              {owner}/{repo}
            </h1>
            <span className="text-sm text-muted-foreground">Studio</span>
            {contentRoot && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{contentRoot}</span>
            )}
            {project && (
              <ProjectSwitcher
                currentProjectId={project._id}
                owner={owner}
                repo={repo}
                branch={currentBranch}
              />
            )}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="container mx-auto px-4 py-8">
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
            githubToken={token}
          />
        </div>
      )}
    </div>
  )
}
