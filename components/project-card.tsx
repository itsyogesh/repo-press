"use client"

import { ArrowRight, Folder, GitBranch } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDashboardDate } from "@/lib/dashboard-date"
import { cn } from "@/lib/utils"

interface ProjectCardProps {
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

export function getProjectContentRootLabel(contentRoot: string): string {
  if (!contentRoot) return "Repo root"
  return contentRoot.split("/").pop() ?? contentRoot
}

export function getProjectFrameworkLabel(project: { detectedFramework?: string; contentType: string }): string {
  if (project.detectedFramework && project.detectedFramework !== "detected") {
    return project.detectedFramework
  }
  return project.contentType
}

export function getProjectSourceLabel(project: { frameworkSource?: string; detectedFramework?: string }): string {
  if (project.frameworkSource === "config") return "Config"
  if (project.detectedFramework && project.detectedFramework !== "detected") return "Detected"
  return "Manual"
}

export function ProjectCard({ project }: ProjectCardProps) {
  const updatedOn = formatDashboardDate(project.updatedAt)
  const repoLabel = `${project.repoOwner}/${project.repoName}`

  return (
    <article className="surface-card flex h-full flex-col rounded-[1.5rem] border p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">{repoLabel}</p>
          <h3 className="mt-3 truncate text-xl font-semibold tracking-[-0.03em] text-foreground">{project.name}</h3>
        </div>

        {project.detectedFramework &&
        project.detectedFramework !== "custom" &&
        project.detectedFramework !== "detected" ? (
          <Badge
            variant="secondary"
            className="shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.16em]"
          >
            {project.detectedFramework}
          </Badge>
        ) : null}
      </div>

      <dl className="mt-6 grid gap-4 text-sm">
        <div className="flex items-start justify-between gap-4">
          <dt className="shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Path</dt>
          <dd className="min-w-0 text-right text-muted-foreground">
            <span className="inline-flex max-w-full items-center gap-1.5 truncate">
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate" title={project.contentRoot || undefined}>
                {getProjectContentRootLabel(project.contentRoot)}
              </span>
            </span>
          </dd>
        </div>

        <div className="flex items-start justify-between gap-4">
          <dt className="shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
            Branch
          </dt>
          <dd className="text-right text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 shrink-0" />
              {project.branch}
            </span>
          </dd>
        </div>

        <div className="flex items-start justify-between gap-4">
          <dt className="shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Type</dt>
          <dd className="text-right text-foreground">
            <span className="capitalize">{project.contentType}</span>
            <span className="ml-2 text-muted-foreground" aria-hidden="true">
              ·
            </span>
            <span className={cn(project.frameworkSource === "config" ? "text-foreground" : "text-muted-foreground")}>
              {getProjectSourceLabel(project)}
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between gap-4 pt-6">
        <p className="text-xs text-muted-foreground">
          Updated{" "}
          {project.updatedAt ? <time dateTime={new Date(project.updatedAt).toISOString()}>{updatedOn}</time> : "N/A"}
        </p>

        <Button asChild variant="ghost" size="sm" className="-mr-2 px-2 text-foreground hover:bg-muted/70">
          <Link
            href={`/dashboard/${project.repoOwner}/${project.repoName}/studio?branch=${project.branch}&projectId=${project._id}`}
          >
            Open Studio
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  )
}
