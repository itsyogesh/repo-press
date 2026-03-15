"use client"

import { ArrowRight, Folder, GitBranch } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
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

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0 flex-1">
            <CardTitle className="text-lg truncate">{project.name}</CardTitle>
            <CardDescription className="flex items-center gap-2 text-xs">
              <span className="truncate">
                {project.repoOwner}/{project.repoName}
              </span>
              {project.contentRoot && (
                <span className="flex items-center gap-1 shrink-0">
                  <Folder className="h-3 w-3" />
                  {project.contentRoot}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {project.detectedFramework && project.detectedFramework !== "custom" && (
              <Badge variant="secondary" className="text-[10px]">
                {project.detectedFramework}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto">
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {project.branch}
          </span>
          <span>&middot;</span>
          <span className="capitalize">{project.contentType}</span>
          <span>&middot;</span>
          {project.frameworkSource === "config" ? (
            <span className="text-studio-success font-medium">Config</span>
          ) : (
            <span>Manual</span>
          )}
          <span>&middot;</span>
          <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
        </div>

        <Link
          href={`/dashboard/${project.repoOwner}/${project.repoName}/studio?branch=${project.branch}&projectId=${project._id}`}
          className="w-full mt-2"
        >
          <Button className="w-full" variant="default">
            Open Studio
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
