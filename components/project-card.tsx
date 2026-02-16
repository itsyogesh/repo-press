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
    createdAt: number
  }
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              {project.repoOwner}/{project.repoName}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <GitBranch className="h-3 w-3" />
              {project.branch}
              {project.contentRoot && (
                <>
                  <Folder className="h-3 w-3 ml-1" />
                  {project.contentRoot}
                </>
              )}
            </CardDescription>
          </div>
          {project.detectedFramework && project.detectedFramework !== "custom" && (
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground">
              {project.detectedFramework}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto">
          <span className="capitalize">{project.contentType}</span>
          <span>&middot;</span>
          <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
        </div>

        <Link
          href={`/dashboard/${project.repoOwner}/${project.repoName}/studio?branch=${project.branch}`}
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
