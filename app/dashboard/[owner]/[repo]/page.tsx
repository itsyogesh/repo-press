import { AlertCircle, GitBranch } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { FileBrowser } from "@/components/file-browser"
import { RepoBreadcrumb } from "@/components/repo-breadcrumb"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { getGitHubToken } from "@/lib/auth-server"
import { getRepoContents } from "@/lib/github"

interface RepoPageProps {
  params: Promise<{
    owner: string
    repo: string
  }>
  searchParams: Promise<{
    path?: string
    branch?: string
  }>
}

export default async function RepoPage({ params, searchParams }: RepoPageProps) {
  const token = await getGitHubToken()

  if (!token) {
    redirect("/login")
  }

  const { owner, repo } = await params
  const { path, branch } = await searchParams
  const currentPath = path || ""
  const currentBranch = branch || "main"

  let files: Awaited<ReturnType<typeof getRepoContents>> = []
  let error = null

  try {
    files = await getRepoContents(token, owner, repo, currentPath, currentBranch)
  } catch (e) {
    console.error("Error fetching repo contents:", e)
    error = "Failed to fetch repository contents. Please try again later."
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <RepoBreadcrumb owner={owner} repo={repo} path={currentPath ? [currentPath] : []} />
          <div className="flex gap-2">
            <Button asChild>
              <Link href={`/dashboard/${owner}/${repo}/studio/${currentPath}?branch=${currentBranch}`}>
                Open Studio
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight">
              {owner}/{repo}
            </h1>
            <div className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              {currentBranch}
            </div>
          </div>
          <p className="text-muted-foreground">Browse and manage your repository files</p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!error && files.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/10">
            <p className="text-muted-foreground">No files found in this directory.</p>
          </div>
        ) : (
          <FileBrowser files={files} currentPath={currentPath} owner={owner} repo={repo} branch={currentBranch} />
        )}
      </div>
    </div>
  )
}
