"use client"

import { useQuery } from "convex/react"
import { ArrowUpDown, Search, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { RepoRow } from "@/components/dashboard/repo-row"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/convex/_generated/api"
import type { GitHubRepo } from "@/lib/github"

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

      <div className="flex flex-col">
        {repos.map((repo) => (
          <RepoRow key={repo.id} repo={repo} connectedProjectCount={getProjectCount(repo)} />
        ))}
      </div>
    </section>
  )
}

export function RepoGrid({ repos, serverProjects }: RepoGridProps) {
  const convexProjects = useQuery(api.projects.listAccessibleProjects)
  const [query, setQuery] = useState("")
  const [sortMode, setSortMode] = useState<"connected-first" | "alpha">("connected-first")
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

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

  const getProjectCount = (repo: GitHubRepo) => projectCountMap.get(repo.full_name) || 0

  const sortedRepos = [...repos].sort((a, b) => {
    if (sortMode === "alpha") {
      return a.name.localeCompare(b.name)
    }
    const aCount = projectCountMap.get(a.full_name) || 0
    const bCount = projectCountMap.get(b.full_name) || 0
    if (aCount > 0 && bCount === 0) return -1
    if (aCount === 0 && bCount > 0) return 1
    const aDate = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const bDate = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return bDate - aDate
  })

  const normalizedQuery = query.toLowerCase().trim()
  const isFiltering = normalizedQuery.length > 0

  const filtered = isFiltering
    ? sortedRepos.filter(
        (repo) =>
          repo.name.toLowerCase().includes(normalizedQuery) || repo.full_name.toLowerCase().includes(normalizedQuery),
      )
    : sortedRepos

  const useFlatLayout = isFiltering || sortMode === "alpha"
  const connectedRepos = filtered.filter((repo) => getProjectCount(repo) > 0)
  const availableRepos = filtered.filter((repo) => getProjectCount(repo) === 0)

  const repoPlural = repos.length !== 1 ? "repos" : "repo"
  const repoCountLabel = isFiltering
    ? `${filtered.length} of ${repos.length} ${repoPlural}`
    : `${repos.length} ${repoPlural}`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="search"
            placeholder="Find a repository…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("")
                searchRef.current?.blur()
              }
            }}
            className="h-9 rounded-md pl-9 pr-16 text-sm"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("")
                searchRef.current?.focus()
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              /
            </kbd>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortMode((m) => (m === "connected-first" ? "alpha" : "connected-first"))}
          className="h-9 gap-1.5 text-sm font-medium"
          title={sortMode === "connected-first" ? "Sort A–Z" : "Sort connected first"}
        >
          <ArrowUpDown className="size-4" />
          {sortMode === "alpha" ? "A–Z" : "Connected"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{repoCountLabel}</p>

      {isFiltering && filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/40 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">No repositories match &ldquo;{query}&rdquo;</p>
          <p className="mt-1 text-sm text-muted-foreground">Try a different search term or clear the filter.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </div>
      ) : useFlatLayout ? (
        <div className="flex flex-col">
          {filtered.map((repo) => (
            <RepoRow key={repo.id} repo={repo} connectedProjectCount={getProjectCount(repo)} />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <RepoSection
            title="Connected repositories"
            description="Repositories already in motion. Open the hub to manage config-synced, manual, and active project states."
            repos={connectedRepos}
            getProjectCount={getProjectCount}
          />
          <RepoSection
            title={connectedRepos.length > 0 ? "Available repositories" : "Your repositories"}
            description={
              connectedRepos.length > 0
                ? "Repositories ready for setup. Connect one when you need a new editing surface."
                : "Pick a repository to get started. The hub handles setup, sync, and project organization."
            }
            repos={connectedRepos.length > 0 ? availableRepos : filtered}
            getProjectCount={getProjectCount}
          />
        </div>
      )}
    </div>
  )
}
