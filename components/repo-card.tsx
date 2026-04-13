import { ArrowRight, CheckCircle2, GitBranch, GitFork, Plus } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDashboardDate } from "@/lib/dashboard-date"
import type { GitHubRepo } from "@/lib/github"
import { cn } from "@/lib/utils"

interface RepoCardProps {
  repo: GitHubRepo
  connectedProjectCount?: number
}

export function getRepoConnectionLabel(count: number): string {
  return count > 0 ? "Connected" : "Set up"
}

export function RepoCard({ repo, connectedProjectCount = 0 }: RepoCardProps) {
  const isConnected = connectedProjectCount > 0
  const updatedOn = formatDashboardDate(repo.updated_at)

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-[1.5rem] border p-5 sm:p-6",
        isConnected ? "surface-card border-border/80" : "bg-muted/20",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">{repo.full_name}</p>
          <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-foreground">{repo.name}</h3>
        </div>

        <Badge
          variant={isConnected ? "secondary" : "outline"}
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.16em]",
            !isConnected && "text-muted-foreground",
          )}
        >
          {isConnected ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connected
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              Set up
            </>
          )}
        </Badge>
      </div>

      <p className="mt-4 min-h-[3rem] text-sm leading-6 text-muted-foreground">
        {repo.description || "Open the repository hub to connect content roots, settings, and active projects."}
      </p>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Projects</dt>
          <dd className="mt-1 text-foreground">
            {isConnected ? `${connectedProjectCount} projects` : "Not connected yet"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Branch</dt>
          <dd className="mt-1 inline-flex items-center gap-1.5 text-foreground">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            {repo.default_branch}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Visibility</dt>
          <dd className="mt-1 text-muted-foreground">
            {repo.private ? "Private" : "Public"}
            {repo.fork ? " · Fork" : ""}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Updated</dt>
          <dd className="mt-1 text-muted-foreground">
            {repo.updated_at ? <time dateTime={repo.updated_at}>{updatedOn}</time> : "N/A"}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-6">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          {repo.language ? <span>{repo.language}</span> : null}
          {repo.forks_count > 0 ? (
            <span className="inline-flex items-center gap-1">
              <GitFork className="h-3.5 w-3.5" />
              {repo.forks_count}
            </span>
          ) : null}
        </div>

        <Button asChild variant="ghost" size="sm" className="-mr-2 px-2 text-foreground hover:bg-muted/70">
          <Link href={`/dashboard/${repo.owner.login}/${repo.name}`}>
            {isConnected ? "Open repo hub" : "Set up repo"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  )
}
