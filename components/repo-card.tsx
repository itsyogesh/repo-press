import { Calendar, Eye, GitFork, Star } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { GitHubRepo } from "@/lib/github"

interface RepoCardProps {
  repo: GitHubRepo
}

export function RepoCard({ repo }: RepoCardProps) {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{repo.name}</CardTitle>
            <CardDescription className="line-clamp-1">{repo.full_name}</CardDescription>
          </div>
          {repo.private && (
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground">Private</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {repo.description || "No description provided."}
        </p>

        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-auto">
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

        <Link href={`/dashboard/${repo.owner.login}/${repo.name}/setup`} className="w-full mt-4">
          <Button className="w-full bg-transparent" variant="outline">
            Select Repository
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
