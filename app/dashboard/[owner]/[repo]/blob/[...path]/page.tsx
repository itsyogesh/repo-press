import { AlertCircle } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { FileContentViewer } from "@/components/file-content-viewer"
import { RepoBreadcrumb } from "@/components/repo-breadcrumb"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { getGitHubToken } from "@/lib/auth-server"
import { getFileContent } from "@/lib/github"

interface FilePageProps {
  params: Promise<{
    owner: string
    repo: string
    path: string[]
  }>
  searchParams: Promise<{
    branch?: string
  }>
}

export default async function FilePage({ params, searchParams }: FilePageProps) {
  const token = await getGitHubToken()

  if (!token) {
    redirect("/login")
  }

  const { owner, repo, path } = await params
  const { branch } = await searchParams
  const currentBranch = branch || "main"

  const filePath = path.join("/")
  console.log(`[v0] Fetching file: ${owner}/${repo}/${filePath} on branch: ${currentBranch}`)

  const fileName = path[path.length - 1]
  const fileExtension = fileName.split(".").pop()

  let content = null
  let error = null

  if (token) {
    try {
      console.log(`[v0] Token present, calling getFileContent`)
      content = await getFileContent(token, owner, repo, filePath, currentBranch)
      console.log(`[v0] getFileContent result:`, content ? "Found content" : "Null content")
      if (content === null) {
        error = "File not found or unable to read content."
      }
    } catch (e) {
      console.error("Error fetching file content:", e)
      error = "Failed to fetch file content. Please try again later."
    }
  } else {
    error = "GitHub access token not found. Please sign out and sign in again."
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <RepoBreadcrumb owner={owner} repo={repo} path={path} branch={currentBranch} />
          <Button variant="outline" asChild>
            <Link href={`/dashboard/${owner}/${repo}?path=${path.slice(0, -1).join("/")}&branch=${currentBranch}`}>
              Back to Folder
            </Link>
          </Button>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <FileContentViewer fileName={fileName} content={content || ""} language={fileExtension} />
        )}
      </div>
    </div>
  )
}
