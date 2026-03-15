"use client"

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Files,
  Folder,
  GitBranch,
  Loader2,
  RefreshCw,
  Settings,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import { retrySyncAction } from "@/lib/sync-projects"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"

interface HubProject {
  _id: string
  name: string
  branch: string
  contentRoot: string
  detectedFramework?: string
  contentType: string
  frameworkSource?: string
  createdAt: number
  updatedAt: number
}

interface RepoProjectHubProps {
  owner: string
  repo: string
  defaultBranch: string
  /** True when the default branch was inferred heuristically, not from GitHub API */
  defaultBranchInferred?: boolean
  projects: HubProject[]
  hasConfig: boolean
  configSynced: boolean
  syncError: string | null
  isWriter: boolean
  role: "owner" | "editor" | "viewer"
}

export function RepoProjectHub({
  owner,
  repo,
  defaultBranch,
  defaultBranchInferred,
  projects,
  hasConfig,
  configSynced,
  syncError,
  isWriter,
  role,
}: RepoProjectHubProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleRetrySync = () => {
    startTransition(async () => {
      try {
        await retrySyncAction(owner, repo, defaultBranch)
        toast.success("Projects synced successfully")
        router.refresh()
      } catch (err: any) {
        toast.error(err.message || "Failed to sync projects")
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to Dashboard</span>
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {owner}/{repo}
              </h1>
              <div
                className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground"
                title={defaultBranchInferred ? "Branch detected heuristically — verify this is correct" : undefined}
              >
                <GitBranch className="h-3 w-3" />
                {defaultBranch}
                {defaultBranchInferred && (
                  <AlertCircle className="h-3 w-3 text-studio-attention" />
                )}
              </div>
              {hasConfig && (
                <Badge
                  variant="outline"
                  className={
                    configSynced
                      ? "border-studio-success/20 bg-studio-success-muted text-studio-success"
                      : "border-studio-attention/20 bg-studio-attention-muted text-studio-attention"
                  }
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {configSynced ? "Config-synced" : "Config found"}
                </Badge>
              )}
              {!hasConfig && projects.length > 0 && (
                <Badge variant="outline" className="border-muted-foreground/30">
                  <Wrench className="h-3 w-3 mr-1" />
                  Manual
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/${owner}/${repo}/files?branch=${defaultBranch}`}>
              <Files className="h-4 w-4 mr-1.5" />
              Browse Files
            </Link>
          </Button>
          <Button variant="outline" size="icon" asChild className="h-8 w-8" title="Settings">
            <Link href={`/dashboard/${owner}/${repo}/settings`}>
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Inferred branch warning — shown when no projects found and branch is a guess */}
      {defaultBranchInferred && projects.length === 0 && !syncError && (
        <Alert className="border-studio-attention/20 bg-studio-attention-muted/60">
          <AlertCircle className="h-4 w-4 text-studio-attention" />
          <AlertTitle className="text-studio-attention text-sm">Branch may be incorrect</AlertTitle>
          <AlertDescription className="text-xs text-studio-attention">
            We couldn&apos;t confirm the default branch from GitHub and guessed <span className="font-medium">{defaultBranch}</span>.
            If your repo uses a different default branch, the config file may not have been found.
            Try the setup page to select the correct branch.
          </AlertDescription>
        </Alert>
      )}

      {/* Sync error */}
      {syncError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sync Error</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{syncError}</span>
            <Button variant="outline" size="sm" onClick={handleRetrySync} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {isPending ? "Syncing..." : "Retry Sync"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Project cards */}
      {projects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((project) => (
              <Card key={project._id} className="flex flex-col h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 text-xs">
                        {project.contentRoot && (
                          <span className="flex items-center gap-1">
                            <Folder className="h-3 w-3" />
                            {project.contentRoot}
                          </span>
                        )}
                        {project.branch !== defaultBranch && (
                          <span className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {project.branch}
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
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {project.contentType}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3 pt-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto">
                    {project.frameworkSource === "config" && (
                      <span className="text-studio-success font-medium">Config</span>
                    )}
                    {project.frameworkSource !== "config" && (
                      <span className="text-muted-foreground font-medium">Manual</span>
                    )}
                    <span>&middot;</span>
                    <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <Link
                    href={`/dashboard/${owner}/${repo}/studio?branch=${project.branch}&projectId=${project._id}`}
                    className="w-full"
                  >
                    <Button className="w-full" variant="default" size="sm">
                      Open Studio
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-16 border rounded-lg bg-muted/10">
          <div className="flex flex-col items-center gap-3 text-center max-w-md">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Folder className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No projects found</h3>
            {hasConfig && syncError ? (
              <p className="text-sm text-muted-foreground">
                A config file was found but sync failed. Try syncing again.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Set up this repository to start managing content with RepoPress.
                </p>
                <Button asChild>
                  <Link href={`/dashboard/${owner}/${repo}/setup`}>
                    Set up this repository
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
