import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getUserRepos } from "@/lib/github"
import { RepoCard } from "@/components/repo-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { cookies } from "next/headers"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const cookieStore = await cookies()
  const pat = cookieStore.get("github_pat")?.value
  const token = session?.provider_token || pat

  if (!token) {
    redirect("/login")
  }

  // Check for non-ASCII characters which cause the "Headers" error
  if (/[^\x20-\x7E]/.test(token)) {
    console.error("Token contains invalid characters")
  }

  let repos = []
  let error = null
  let shouldRedirect = false

  try {
    repos = await getUserRepos(token)
  } catch (e: any) {
    console.error("Error fetching repos:", e)

    // Check for 401 Bad Credentials or the specific header error
    if (e.status === 401 || e.message?.includes("Bad credentials")) {
      shouldRedirect = true
    } else if (e.message?.includes("Failed to construct 'Headers'")) {
      // This is also effectively an invalid token
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
        <p className="text-muted-foreground">Select a repository to start managing your content.</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

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
  )
}
