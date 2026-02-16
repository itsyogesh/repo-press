import { ConvexHttpClient } from "convex/browser"
import { AlertCircle } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { StudioLayout } from "@/components/studio/studio-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { api } from "@/convex/_generated/api"
import { getGitHubToken } from "@/lib/auth-server"
import { getFile, getRepoContents } from "@/lib/github"

interface StudioPageProps {
  params: Promise<{
    owner: string
    repo: string
    path?: string[]
  }>
  searchParams: Promise<{
    branch?: string
  }>
}

export default async function StudioPage({ params, searchParams }: StudioPageProps) {
  const token = await getGitHubToken()

  if (!token) {
    redirect("/login")
  }

  const { owner, repo, path } = await params
  const { branch } = await searchParams
  const currentBranch = branch || "main"
  const currentPath = path ? path.join("/") : ""

  // Look up the project server-side by repo owner/name + branch
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
  const project = await convex.query(api.projects.findByRepo, {
    repoOwner: owner,
    repoName: repo,
    branch: currentBranch,
  })

  // Use project's contentRoot to scope file listing (falls back to repo root)
  const contentRoot = project?.contentRoot || ""

  let files: any[] = []
  let fileData = null
  let error = null

  try {
    // When a specific path is requested, try to fetch it as a file
    if (currentPath) {
      const potentialFileData = await getFile(token, owner, repo, currentPath, currentBranch)

      if (potentialFileData) {
        fileData = potentialFileData
        // Fetch parent directory for the sidebar
        const parentPath = currentPath.split("/").slice(0, -1).join("/")
        files = await getRepoContents(token, owner, repo, parentPath, currentBranch)
      } else {
        // It is a directory
        files = await getRepoContents(token, owner, repo, currentPath, currentBranch)
      }
    } else {
      // No path specified — scope to the project's contentRoot
      files = await getRepoContents(token, owner, repo, contentRoot, currentBranch)
    }
  } catch (e) {
    console.error("Error fetching studio data:", e)
    error = "Failed to fetch repository data. Please try again later."
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b bg-background">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">
              {owner}/{repo}
            </h1>
            <span className="text-sm text-muted-foreground">Studio</span>
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
        <StudioLayout
          files={files}
          initialFile={fileData}
          owner={owner}
          repo={repo}
          branch={currentBranch}
          currentPath={currentPath}
          projectId={project?._id}
        />
      )}
    </div>
  )
}
