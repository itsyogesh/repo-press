import { Calendar, CheckCircle2, Eye, GitFork, Plus, Star } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { GitHubRepo } from "@/lib/github"

interface RepoCardProps {
  repo: GitHubRepo
  connectedProjectCount?: number
}

export function getRepoConnectionLabel(connectedProjectCount: number) {
  return connectedProjectCount > 0 ? "Connected" : "Set up"
}

export function formatRepoUpdatedDate(updatedAt?: string | null) {
  return updatedAt ? new Date(updatedAt).toISOString().slice(0, 10) : "N/A"
}

export function RepoCard({ repo, connectedProjectCount = 0 }: RepoCardProps) {
  const isConnected = connectedProjectCount > 0
  const connectionLabel = getRepoConnectionLabel(connectedProjectCount)
  const updatedDate = formatRepoUpdatedDate(repo.updated_at)

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="gap-3">
        <div className="space-y-1.5 min-w-0">
          <CardTitle className="text-lg leading-tight break-words">{repo.name}</CardTitle>
          <CardDescription className="break-all">{repo.full_name}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {repo.private ? (
            <span className="rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground">Private</span>
          ) : null}
          {isConnected ? (
            <Badge variant="outline" className="border-studio-success/20 bg-studio-success-muted text-studio-success">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {connectionLabel}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
              <Plus className="h-3 w-3 mr-1" />
              {connectionLabel}
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {repo.description || "No description provided."}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground mt-auto">
          {isConnected && (
            <span className="font-medium text-studio-success">
              {connectedProjectCount} project{connectedProjectCount !== 1 ? "s" : ""}
            </span>
          )}
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3" />
            <span>{repo.stargazers_count}</span>
          </div>
          <div className="flex items-center gap-1">
            <GitFork className="h-3 w-3" />
            <span>{repo.forks_count}</span>
          </div>
          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            <span>{repo.watchers_count}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{repo.updated_at ? <time dateTime={repo.updated_at}>{updatedDate}</time> : updatedDate}</span>
          </div>
        </div>

        {/* All cards link to the hub — hub handles empty/setup state */}
        <Link href={`/dashboard/${repo.owner.login}/${repo.name}`} className="w-full mt-4">
          <Button className="w-full bg-transparent" variant="outline">
            {isConnected ? "View Projects" : "Set Up Repository"}
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
