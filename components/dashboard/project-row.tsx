"use client"

import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { getProjectContentRootLabel } from "@/components/project-card"
import { formatDashboardDate } from "@/lib/dashboard-date"

interface ProjectRowProps {
  project: {
    _id: string
    name: string
    repoOwner: string
    repoName: string
    branch: string
    contentRoot: string
    detectedFramework?: string
    contentType: string
    frameworkSource?: string
    createdAt: number
    updatedAt: number
  }
}

/**
 * A recent-project row — editorial, notebook-calm. Hairline-divided,
 * no shadowed card; the path renders in mono and the row nudges right
 * on hover, surfacing "Open →".
 */
export function ProjectRow({ project }: ProjectRowProps) {
  const updatedOn = formatDashboardDate(project.updatedAt)
  const framework =
    project.detectedFramework && !["custom", "detected"].includes(project.detectedFramework)
      ? project.detectedFramework
      : null
  const href = `/dashboard/${project.repoOwner}/${project.repoName}/studio?branch=${project.branch}&projectId=${project._id}`

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 border-b border-border py-3 transition-[padding-left] duration-150 ease-out hover:pl-2"
    >
      <span className="size-[7px] shrink-0 rounded-full bg-primary" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{project.name}</span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {project.repoOwner}/{project.repoName} · {project.branch} · {getProjectContentRootLabel(project.contentRoot)}
        </span>
      </div>
      {framework ? (
        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground md:inline">
          {framework}
        </span>
      ) : null}
      <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground/70 sm:inline">{updatedOn}</span>
      <span className="hidden shrink-0 items-center gap-1 text-sm text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100 sm:inline-flex">
        Open <ArrowRight className="size-3.5" />
      </span>
    </Link>
  )
}
