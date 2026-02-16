"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { ProjectCard } from "./project-card"

export function ProjectList() {
  const user = useQuery(api.auth.getCurrentUser)
  const projects = useQuery(
    api.projects.list,
    user?._id ? { userId: user._id } : "skip",
  )

  if (!user || projects === undefined) {
    return null
  }

  if (projects.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">My Projects</h2>
        <p className="text-sm text-muted-foreground">Continue editing your content</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project._id} project={project} />
        ))}
      </div>
    </div>
  )
}
