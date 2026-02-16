import { redirect } from "next/navigation"
import { getRepoContents, getFile } from "@/lib/github"
import { StudioLayout } from "@/components/studio/studio-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { getGitHubToken } from "@/lib/auth-server"

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
  const { branch, projectId } = await searchParams
  const currentBranch = branch || "main"
  const currentPath = path ? path.join("/") : ""

  let files: any[] = []
  let fileData = null
  let error = null

  try {
    // Try to fetch as a file first
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
          projectId={projectId}
        />
      )}
    </div>
  )
}
