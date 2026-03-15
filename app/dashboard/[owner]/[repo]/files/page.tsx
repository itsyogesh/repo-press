import { AlertCircle, ArrowLeft, GitBranch } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { FileBrowser } from "@/components/file-browser"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
              <Link href={`/dashboard/${owner}/${repo}`}>
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Back to project hub</span>
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {owner}/{repo}
              </h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                <GitBranch className="h-3 w-3" />
                {currentBranch}
                {currentPath && <span className="ml-1">/ {currentPath}</span>}
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/dashboard/${owner}/${repo}`}>Back to Projects</Link>
          </Button>
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
