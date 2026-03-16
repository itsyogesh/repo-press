"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { Doc } from "@/convex/_generated/dataModel"
import { SettingsProjectCard } from "./settings-project-card"

interface ProjectsSectionProps {
  projects: Doc<"projects">[]
  owner: string
  repo: string
}

export function ProjectsSection({ projects, owner, repo }: ProjectsSectionProps) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/5 border-studio-border/50">
        <p className="text-muted-foreground font-sans">No projects found for this repository.</p>
        <Button variant="link" asChild className="mt-2 text-primary">
          <Link href={`/dashboard/${owner}/${repo}/setup`}>Configure a project</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {projects.map((project) => (
        <SettingsProjectCard key={project._id} project={project} />
      ))}
    </div>
  )
}
