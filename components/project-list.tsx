"use client"

import { useQuery } from "convex/react"

import { ProjectRow } from "@/components/dashboard/project-row"
import { api } from "@/convex/_generated/api"

interface ProjectListProps {
  serverProjects?: any[]
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{children}</p>
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
      <section className="mt-12">
        <SectionLabel>Recent projects</SectionLabel>
        <h2 className="mt-2 font-serif text-2xl font-normal tracking-[-0.01em] text-foreground">
          Pick up where you left off
        </h2>
        <div className="mt-6 flex flex-col">
          {Array.from({ length: 3 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
            <div key={`project-skeleton-${i}`} className="flex items-center gap-4 border-b border-border py-3">
              <span className="size-[7px] shrink-0 rounded-full bg-muted" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="studio-skeleton h-3.5 w-40 rounded-sm" />
                <div className="studio-skeleton h-2.5 w-64 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (projects.length === 0) {
    return (
      <section className="mt-12">
        <SectionLabel>Recent projects</SectionLabel>
        <h2 className="mt-2 font-serif text-2xl font-normal tracking-[-0.01em] text-foreground">
          Pick up where you left off
        </h2>
        <div className="mt-6 border-y border-border py-12 text-center">
          <p className="text-sm font-medium text-foreground">No recent projects yet</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Connect a repository below to create or sync a project. Your latest work will then stay at the top.
          </p>
        </div>
      </section>
    )
  }

  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
  const groups = new Map<string, typeof sorted>()
  for (const project of sorted) {
    const key = `${project.repoOwner}/${project.repoName}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)?.push(project)
  }
  const showGroupHeaders = groups.size > 1

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <SectionLabel>Recent projects</SectionLabel>
          <h2 className="mt-2 font-serif text-2xl font-normal tracking-[-0.01em] text-foreground">
            Pick up where you left off
          </h2>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </span>
      </div>

      {showGroupHeaders ? (
        <div className="mt-6 flex flex-col gap-8">
          {Array.from(groups.entries()).map(([repoKey, repoProjects]) => (
            <div key={repoKey}>
              <p className="mb-1 font-mono text-[11px] text-muted-foreground">{repoKey}</p>
              <div className="flex flex-col">
                {repoProjects.map((project) => (
                  <ProjectRow key={project._id} project={project} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 flex flex-col">
          {sorted.map((project) => (
            <ProjectRow key={project._id} project={project} />
          ))}
        </div>
      )}
    </section>
  )
}
