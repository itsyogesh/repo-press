"use client"

import { useQuery } from "convex/react"
import { Folder } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { ProjectCard } from "./project-card"

interface ProjectListProps {
  serverProjects?: any[]
}

export function ProjectList({ serverProjects }: ProjectListProps) {
  const convexProjects = useQuery(api.projects.listAccessibleProjects)

  // Convex query: undefined = still loading, [] = loaded (empty or no session).
  // For PAT users the query returns [] (no OAuth session), so serverProjects is authoritative.
  // For OAuth users the Convex query is authoritative once loaded.
  const projects = convexProjects === undefined
    ? serverProjects                          // still loading — use server data if available
    : convexProjects.length > 0
      ? convexProjects                        // Convex has data (OAuth user with projects)
      : (serverProjects ?? convexProjects)    // Convex empty — prefer server data (PAT), else empty array (OAuth)

  if (projects === undefined) {
    return null
  }

  if (projects.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-tight">Recent Projects</h2>
            <p className="text-sm text-muted-foreground">Your content projects will appear here</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 border rounded-lg bg-muted/10">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
            <Folder className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No projects yet. Select a repository below to get started.
          </p>
        </div>
      </div>
    )
  }

  // Sort by most recently updated
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  // Group by repo
  const groups = new Map<string, typeof sorted>()
  for (const project of sorted) {
    const key = `${project.repoOwner}/${project.repoName}`
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(project)
  }

  // For single-repo users, don't show sub-headers
  const showGroupHeaders = groups.size > 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">
            Recent Projects
            <span className="ml-2 text-sm font-normal text-muted-foreground">({projects.length})</span>
          </h2>
          <p className="text-sm text-muted-foreground">Continue editing your content</p>
        </div>
      </div>

      {showGroupHeaders ? (
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([repoKey, repoProjects]) => (
            <div key={repoKey} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{repoKey}</h3>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {repoProjects.map((project) => (
                  <ProjectCard key={project._id} project={project} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((project) => (
            <ProjectCard key={project._id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}
