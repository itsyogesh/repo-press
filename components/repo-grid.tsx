"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { GitHubRepo } from "@/lib/github"
import { RepoCard } from "./repo-card"

interface RepoGridProps {
  repos: GitHubRepo[]
  serverProjects?: any[]
}

export function RepoGrid({ repos, serverProjects }: RepoGridProps) {
  const convexProjects = useQuery(api.projects.listAccessibleProjects)

  // Convex query: undefined = still loading, [] = loaded (empty or no session).
  // For PAT users the query returns [] (no OAuth session), so serverProjects is authoritative.
  const projects = convexProjects === undefined
    ? serverProjects
    : convexProjects.length > 0
      ? convexProjects
      : (serverProjects ?? convexProjects)

  // Build a map of "owner/repo" → project count
  const projectCountMap = new Map<string, number>()
  if (projects) {
    for (const p of projects) {
      const key = `${p.repoOwner}/${p.repoName}`
      projectCountMap.set(key, (projectCountMap.get(key) || 0) + 1)
    }
  }

  // Sort: connected repos first, then by updated_at
  const sortedRepos = [...repos].sort((a, b) => {
    const aCount = projectCountMap.get(a.full_name) || 0
    const bCount = projectCountMap.get(b.full_name) || 0

    // Connected repos first
    if (aCount > 0 && bCount === 0) return -1
    if (aCount === 0 && bCount > 0) return 1

    // Then by updated_at
    const aDate = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const bDate = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return bDate - aDate
  })

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {sortedRepos.map((repo) => (
        <RepoCard
          key={repo.id}
          repo={repo}
          connectedProjectCount={projectCountMap.get(repo.full_name) || 0}
        />
      ))}
    </div>
  )
}
