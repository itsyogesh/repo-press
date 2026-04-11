"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { GitHubRepo } from "@/lib/github"
import { RepoCard } from "./repo-card"

interface RepoGridProps {
  repos: GitHubRepo[]
  serverProjects?: any[]
}

function RepoSection({
  title,
  description,
  repos,
  getProjectCount,
}: {
  title: string
  description: string
  repos: GitHubRepo[]
  getProjectCount: (repo: GitHubRepo) => number
}) {
  if (repos.length === 0) {
    return null
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {repos.length} repo{repos.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {repos.map((repo) => (
          <RepoCard key={repo.id} repo={repo} connectedProjectCount={getProjectCount(repo)} />
        ))}
      </div>
    </section>
  )
}

export function RepoGrid({ repos, serverProjects }: RepoGridProps) {
  const convexProjects = useQuery(api.projects.listAccessibleProjects)

  const projects =
    convexProjects === undefined
      ? serverProjects
      : convexProjects.length > 0
        ? convexProjects
        : (serverProjects ?? convexProjects)

  const projectCountMap = new Map<string, number>()
  if (projects) {
    for (const project of projects) {
      const key = `${project.repoOwner}/${project.repoName}`
      projectCountMap.set(key, (projectCountMap.get(key) || 0) + 1)
    }
  }

  const sortedRepos = [...repos].sort((a, b) => {
    const aCount = projectCountMap.get(a.full_name) || 0
    const bCount = projectCountMap.get(b.full_name) || 0

    if (aCount > 0 && bCount === 0) return -1
    if (aCount === 0 && bCount > 0) return 1

    const aDate = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const bDate = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return bDate - aDate
  })

  const connectedRepos = sortedRepos.filter((repo) => (projectCountMap.get(repo.full_name) || 0) > 0)
  const availableRepos = sortedRepos.filter((repo) => (projectCountMap.get(repo.full_name) || 0) === 0)

  return (
    <div className="space-y-8">
      <RepoSection
        title="Connected repositories"
        description="Repositories already in motion. Open the hub to manage config-synced, manual, and active project states."
        repos={connectedRepos}
        getProjectCount={(repo) => projectCountMap.get(repo.full_name) || 0}
      />

      <RepoSection
        title={connectedRepos.length > 0 ? "Available repositories" : "Your repositories"}
        description={
          connectedRepos.length > 0
            ? "Repositories ready for setup. Connect one when you need a new editing surface."
            : "Start from the repository you want to manage. The hub handles initial setup, sync, and project organization."
        }
        repos={connectedRepos.length > 0 ? availableRepos : sortedRepos}
        getProjectCount={(repo) => projectCountMap.get(repo.full_name) || 0}
      />
    </div>
  )
}
