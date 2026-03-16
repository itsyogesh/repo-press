"use client"

import { Folder, GitBranch, Terminal } from "lucide-react"
import { DeleteProjectZone } from "@/components/settings/delete-project-zone"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Doc } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"

interface SettingsProjectCardProps {
  project: Doc<"projects">
  className?: string
}

/**
 * Redesigned Project Card for Settings.
 * Matches the clean, functional design of RepoPress.
 */
export function SettingsProjectCard({ project, className }: SettingsProjectCardProps) {
  return (
    <Card
      className={cn(
        "group overflow-hidden border-border bg-card transition-all duration-200 hover:shadow-md",
        className,
      )}
    >
      <CardHeader className="pb-4 px-6 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl font-bold tracking-tight truncate">{project.name}</CardTitle>
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[10px] uppercase font-bold tracking-tight bg-muted/50 text-muted-foreground shrink-0"
              >
                {project.contentType}
              </Badge>
            </div>
            <CardDescription className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 shrink-0">
                <Folder className="h-3.5 w-3.5" />
                <code className="bg-muted px-1 rounded">{project.contentRoot || "/"}</code>
              </span>
              <span className="opacity-20 shrink-0">|</span>
              <span className="flex items-center gap-1.5 truncate">
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{project.branch}</span>
              </span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8 px-6 pb-6">
        <div className="grid grid-cols-2 gap-8 border-t border-border/50 pt-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Terminal className="h-3 w-3" />
              <p className="text-[10px] font-bold uppercase tracking-widest font-sans opacity-60">Framework</p>
            </div>
            <p className="font-mono text-sm text-foreground font-medium uppercase tracking-tight">
              {project.detectedFramework || "Generic"}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest font-sans opacity-60 pl-5">
              Source
            </p>
            <p className="font-mono text-sm text-foreground/80 pl-5">
              {project.frameworkSource === "config" ? "Config File" : "Manual"}
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-border/20">
          <DeleteProjectZone project={project} />
        </div>
      </CardContent>
    </Card>
  )
}
