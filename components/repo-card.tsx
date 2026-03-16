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

export function RepoCard({ repo, connectedProjectCount = 0 }: RepoCardProps) {
  const isConnected = connectedProjectCount > 0

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0 flex-1">
            <CardTitle className="text-lg truncate">{repo.name}</CardTitle>
            <CardDescription className="line-clamp-1">{repo.full_name}</CardDescription>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {repo.private && (
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                Private
              </span>
            )}
            {isConnected ? (
              <Badge
                variant="outline"
                className="border-studio-success/20 bg-studio-success-muted text-studio-success"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                <Plus className="h-3 w-3 mr-1" />
                Set up
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {repo.description || "No description provided."}
        </p>

        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-auto">
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
            <span>{repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : "N/A"}</span>
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
