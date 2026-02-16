import { AlertCircle } from "lucide-react"
import { redirect } from "next/navigation"
import { ProjectList } from "@/components/project-list"
import { RepoCard } from "@/components/repo-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getGitHubToken } from "@/lib/auth-server"
import { getUserRepos } from "@/lib/github"

export default async function DashboardPage() {
  const token = await getGitHubToken()

  if (!token) {
    redirect("/login")
  }

  let repos: Awaited<ReturnType<typeof getUserRepos>> = []
  let error = null
  let shouldRedirect = false

  try {
    repos = await getUserRepos(token)
  } catch (e: any) {
    console.error("Error fetching repos:", e)

    if (e.status === 401 || e.message?.includes("Bad credentials")) {
      shouldRedirect = true
    } else if (e.message?.includes("Failed to construct 'Headers'")) {
      shouldRedirect = true
    } else {
      error = "Failed to fetch repositories. Please check your token or try again later."
    }
  }

  if (shouldRedirect) {
    redirect("/login?error=invalid_token")
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Manage your content projects.</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Convex-backed project list (client component) */}
      <div className="mb-10">
        <ProjectList />
      </div>

      {/* GitHub repos for adding new projects */}
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">Add a Repository</h2>
          <p className="text-sm text-muted-foreground">Select a repository to create a new project.</p>
        </div>

        {!error && repos.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/10">
            <p className="text-muted-foreground">No repositories found.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {repos.map((repo) => (
              <RepoCard key={repo.id} repo={repo} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
