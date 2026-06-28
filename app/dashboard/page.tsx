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

  let serverProjects: any[] | undefined
  const cookieStore = await cookies()
  const isPatUser = !!cookieStore.get("github_pat")?.value

  if (isPatUser) {
    const patUserId = await getPatAuthUserId(token)
    if (patUserId && process.env.NEXT_PUBLIC_CONVEX_URL) {
      try {
        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL)
        const sqt = await mintServerQueryToken()
        const projects = await convex.query(api.projects.listAccessibleProjectsForUser, {
          userId: patUserId,
          serverQueryToken: sqt,
        })
        serverProjects = projects
      } catch {
        // Server project fetch failed - client will show empty state
      }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col px-6 py-10 sm:px-10">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Workspace</p>
        <h1 className="mt-2.5 font-serif text-4xl font-normal leading-[1.05] tracking-[-0.015em] text-foreground sm:text-5xl">
          Dashboard
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Recent projects stay front and center. Repositories remain the system of record when you need setup, sync, and
          broader content organization.
        </p>
        <div className="mt-4 flex items-center gap-3.5 font-mono text-[11px] text-muted-foreground">
          <span>
            {repos.length} repositor{repos.length === 1 ? "y" : "ies"}
          </span>
          {serverProjects?.length ? (
            <>
              <span className="h-2.5 w-px bg-border" />
              <span>
                {serverProjects.length} project{serverProjects.length === 1 ? "" : "s"}
              </span>
            </>
          ) : null}
        </div>
      </header>

      {error ? (
        <Alert variant="destructive" className="mt-8">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ProjectList serverProjects={serverProjects} />

      <section id="repositories" className="mt-14">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Repository hubs</p>
        <h2 className="mt-2 font-serif text-2xl font-normal tracking-[-0.01em] text-foreground">
          Choose a repository to manage
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Connected repositories stay together; the rest are ready for setup when you need another content surface.
        </p>

        <div className="mt-6">
          {!error && repos.length === 0 ? (
            <div className="border-y border-border py-14 text-center">
              <p className="text-sm font-medium text-foreground">No repositories found</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Connect a GitHub account with repository access, then return here to open a repository hub.
              </p>
            </div>
          ) : (
            <RepoGrid repos={repos} serverProjects={serverProjects} />
          )}
        </div>
      </section>
    </div>
  )
}
