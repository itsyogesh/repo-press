import { ConvexHttpClient } from "convex/browser"
import { AlertCircle } from "lucide-react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ProjectList } from "@/components/project-list"
import { RepoGrid } from "@/components/repo-grid"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { api } from "@/convex/_generated/api"
import { getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { getUserRepos } from "@/lib/github"
import { mintServerQueryToken } from "@/lib/project-access-token"

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

  // For PAT users, fetch projects server-side since they lack a Convex auth session.
  // OAuth users get live data via useQuery in the client components.
  let serverProjects: any[] | undefined
  const cookieStore = await cookies()
  const isPatUser = !!cookieStore.get("github_pat")?.value

  if (isPatUser) {
    const patUserId = await getPatAuthUserId(token)
    if (patUserId && process.env.NEXT_PUBLIC_CONVEX_URL) {
      try {
        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL)
        const sqt = await mintServerQueryToken()
        // Use access-scoped query: own projects + shared projects via repoAccessCache
        const projects = await convex.query(api.projects.listAccessibleProjectsForUser, {
          userId: patUserId,
          serverQueryToken: sqt,
        })
        serverProjects = projects
      } catch {
        // Server project fetch failed — client will show empty state
      }
    }
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

      {/* Convex-backed project list (client component, with server fallback for PAT users) */}
      <div className="mb-10">
        <ProjectList serverProjects={serverProjects} />
      </div>

      {/* GitHub repos with connected status */}
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">Your Repositories</h2>
          <p className="text-sm text-muted-foreground">
            Connected repos are shown first. Select a repository to manage its projects.
          </p>
        </div>

        {!error && repos.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/10">
            <p className="text-muted-foreground">No repositories found.</p>
          </div>
        ) : (
          <RepoGrid repos={repos} serverProjects={serverProjects} />
        )}
      </div>
    </div>
  )
}
