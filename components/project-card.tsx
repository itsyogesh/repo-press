"use client"

import { ArrowRight, Folder, GitBranch } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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

function normalizeProjectField(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

export function getProjectContentRootLabel(contentRoot: string) {
  const segments = contentRoot.split("/").filter(Boolean)
  return segments.at(-1) ?? "Repo root"
}

export function getProjectFrameworkLabel(
  project: Pick<ProjectCardProps["project"], "detectedFramework" | "contentType">,
) {
  const detectedFramework = normalizeProjectField(project.detectedFramework)
  if (
    detectedFramework &&
    detectedFramework !== "custom" &&
    detectedFramework !== "config" &&
    detectedFramework !== "detected"
  ) {
    return project.detectedFramework ?? project.contentType
  }
  return project.contentType
}

export function getProjectSourceLabel(
  project: Pick<ProjectCardProps["project"], "frameworkSource" | "detectedFramework">,
) {
  if (project.frameworkSource === "config") {
    return "Config"
  }

  const detectedFramework = normalizeProjectField(project.detectedFramework)
  if (
    detectedFramework &&
    detectedFramework !== "custom" &&
    detectedFramework !== "config" &&
    detectedFramework !== "detected"
  ) {
    return "Detected"
  }

  return "Manual"
}

export function formatProjectUpdatedDate(updatedAt: number) {
  return updatedAt ? new Date(updatedAt).toISOString().slice(0, 10) : "N/A"
}

export function ProjectCard({ project }: ProjectCardProps) {
  const repoLabel = `${project.repoOwner}/${project.repoName}`
  const contentRootLabel = getProjectContentRootLabel(project.contentRoot)
  const contentRootTitle = project.contentRoot || "Repository root"
  const frameworkLabel = getProjectFrameworkLabel(project)
  const sourceLabel = getProjectSourceLabel(project)
  const updatedLabel = formatProjectUpdatedDate(project.updatedAt)

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-lg leading-tight break-words">{project.name}</CardTitle>
          <CardDescription className="truncate text-sm">{repoLabel}</CardDescription>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground" title={contentRootTitle}>
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{contentRootLabel}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 pt-0">
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <GitBranch className="h-3 w-3" />
            {project.branch}
          </span>
          <span className="whitespace-nowrap">{frameworkLabel}</span>
          {sourceLabel === "Config" ? (
            <span className="whitespace-nowrap font-medium text-studio-success">Config</span>
          ) : (
            <span className="whitespace-nowrap">{sourceLabel}</span>
          )}
          <span className="whitespace-nowrap">
            Updated{" "}
            {updatedLabel !== "N/A" ? (
              <time dateTime={new Date(project.updatedAt).toISOString()}>{updatedLabel}</time>
            ) : (
              "N/A"
            )}
          </span>
        </div>

        <Link
          href={`/dashboard/${project.repoOwner}/${project.repoName}/studio?branch=${project.branch}&projectId=${project._id}`}
          className="mt-2 w-full"
        >
          <Button className="w-full" variant="default">
            Open Studio
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
