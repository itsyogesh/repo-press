"use client"

import { useQuery } from "convex/react"
import { Folder } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import { ProjectCard } from "./project-card"

interface ProjectListProps {
  serverProjects?: any[]
}

function ProjectSectionHeader({ count, description }: { count?: number; description: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">Recent projects</p>
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
            Pick up where you left off
          </h2>
          {typeof count === "number" ? (
            <span className="pb-1 text-sm text-muted-foreground">
              {count} project{count !== 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
      </div>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

export function ProjectList({ serverProjects }: ProjectListProps) {
  const convexProjects = useQuery(api.projects.listAccessibleProjects)

  const projects =
    convexProjects === undefined
      ? serverProjects
      : convexProjects.length > 0
        ? convexProjects
        : (serverProjects ?? convexProjects)

  if (projects === undefined) {
    return (
      <section className="space-y-5">
        <ProjectSectionHeader description="Your most recently updated workspaces will appear here as your dashboard loads." />

        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
            <div key={`project-skeleton-${i}`} className="surface-card rounded-[1.5rem] border p-6">
              <div className="space-y-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-7 w-3/4" />
              </div>
              <div className="mt-6 space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="mt-8 flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-28" />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (projects.length === 0) {
    return (
      <section className="space-y-5">
        <ProjectSectionHeader description="Once a repository is connected, its active projects will surface here for quick return trips into Studio." />

        <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-border/70 bg-muted/20 px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background text-muted-foreground">
            <Folder className="h-5 w-5" />
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-[-0.03em] text-foreground">No recent projects yet</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Select a repository below to create or sync a project. Your latest work will then stay at the top of the
            dashboard.
          </p>
        </div>
      </section>
    )
  }

  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
  const groups = new Map<string, typeof sorted>()

  for (const project of sorted) {
    const key = `${project.repoOwner}/${project.repoName}`
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)?.push(project)
  }

  const showGroupHeaders = groups.size > 1

  return (
    <section className="space-y-5">
      <ProjectSectionHeader
        count={projects.length}
        description="Jump back into active content work faster, then move into a repository hub when you need setup, config, or repo-level changes."
      />

      {showGroupHeaders ? (
        <div className="space-y-8">
          {Array.from(groups.entries()).map(([repoKey, repoProjects]) => (
            <section key={repoKey} className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Repository
                  </p>
                  <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-foreground">{repoKey}</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {repoProjects.length} project{repoProjects.length !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {repoProjects.map((project) => (
                  <ProjectCard key={project._id} project={project} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {sorted.map((project) => (
            <ProjectCard key={project._id} project={project} />
          ))}
        </div>
      )}
    </section>
  )
}
