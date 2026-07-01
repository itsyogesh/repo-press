import { AlertCircle } from "lucide-react"
import { redirect } from "next/navigation"
import { FileBrowser } from "@/components/file-browser"
import { RepoBreadcrumb } from "@/components/repo-breadcrumb"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getGitHubToken } from "@/lib/auth-server"
import { getRepoContents } from "@/lib/github"

interface FilesPageProps {
  params: Promise<{
    owner: string
    repo: string
  }>
  searchParams: Promise<{
    path?: string
    branch?: string
  }>
}

export default async function FilesPage({ params, searchParams }: FilesPageProps) {
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

  const pathSegments = currentPath ? currentPath.split("/") : []

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <RepoBreadcrumb owner={owner} repo={repo} path={pathSegments} branch={currentBranch} />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">
                {owner}/{repo}
              </p>
              <h1 className="rp-display mt-1 text-2xl">
                {currentPath ? currentPath.split("/").slice(-1)[0] : "Files"}
              </h1>
            </div>
            <span className="rounded-sm bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {currentBranch}
            </span>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!error && (
          <FileBrowser
            files={files}
            currentPath={currentPath}
            owner={owner}
            repo={repo}
            branch={currentBranch}
            basePath={`/dashboard/${owner}/${repo}/files`}
          />
        )}
      </div>
    </div>
  )
}
