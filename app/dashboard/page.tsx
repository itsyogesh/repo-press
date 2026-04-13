import { ConvexHttpClient } from "convex/browser"
import { AlertCircle, FolderGit2, LayoutGrid } from "lucide-react"
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6">
      <section className="rounded-[2rem] border border-border/70 bg-muted/20 p-6 sm:p-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Workspace</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">Dashboard</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              Recent projects stay front and center. Repositories remain the system of record when you need setup, sync,
              and broader content organization.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
            <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                  <LayoutGrid className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Recent projects
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Return to active Studio work without hunting through setup screens.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                  <FolderGit2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Repository hubs
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Open a repo hub for config sync, orphan cleanup, settings, and new project setup.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ProjectList serverProjects={serverProjects} />

      <section id="repositories" className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">
              Repository hubs
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
              Choose the repo you want to manage
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Connected repositories stay together, while the rest remain ready for setup when you need another content
            surface.
          </p>
        </div>

        {!error && repos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-border/70 bg-muted/20 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background text-muted-foreground">
              <FolderGit2 className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-lg font-semibold tracking-[-0.03em] text-foreground">No repositories found</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Connect a GitHub account with repository access, then return here to open a repository hub.
            </p>
          </div>
        ) : (
          <RepoGrid repos={repos} serverProjects={serverProjects} />
        )}
      </section>
    </div>
  )
}
