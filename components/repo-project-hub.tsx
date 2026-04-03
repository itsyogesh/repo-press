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
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { retrySyncAction } from "@/lib/sync-projects"
import { AddProjectDialog } from "./add-project-dialog"
import { DeleteProjectDialog } from "./delete-project-dialog"
import { type EditableProject, EditProjectDialog } from "./edit-project-dialog"
import { OrphanWarningCard } from "./orphan-warning-card"
import { RawConfigEditor } from "./raw-config-editor"
import { RemoveProjectDialog } from "./remove-project-dialog"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"

export interface HubProject {
  _id: string
  userId: string
  name: string
  branch: string
  contentRoot: string
  detectedFramework?: string
  contentType: string
  frameworkSource?: string
  configProjectId?: string
  configRemoved?: boolean
  configRemovedAt?: number
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
  configJson: string | null
  configSha: string | null
  actingUserId?: string | null
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
  configJson,
  configSha,
  actingUserId,
}: RepoProjectHubProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [editProject, setEditProject] = useState<EditableProject | null>(null)
  const [removeProject, setRemoveProject] = useState<HubProject | null>(null)
  const [deleteProject, setDeleteProject] = useState<HubProject | null>(null)

  const { activeProjects, orphanedProjects } = useMemo(() => {
    const active: HubProject[] = []
    const orphaned: HubProject[] = []
    for (const p of projects) {
      if (p.configRemoved) orphaned.push(p)
      else active.push(p)
    }
    active.sort((a, b) => b.updatedAt - a.updatedAt)
    orphaned.sort((a, b) => (b.configRemovedAt ?? b.updatedAt) - (a.configRemovedAt ?? a.updatedAt))
    return { activeProjects: active, orphanedProjects: orphaned }
  }, [projects])

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

  const handleDialogSuccess = () => {
    router.refresh()
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
                {defaultBranchInferred && <AlertCircle className="h-3 w-3 text-studio-attention" />}
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
              {activeProjects.length} project{activeProjects.length !== 1 ? "s" : ""}
              {orphanedProjects.length > 0 && (
                <span className="text-studio-attention ml-1">· {orphanedProjects.length} removed from config</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isWriter && hasConfig && (
            <Button variant="default" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Project
            </Button>
          )}
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
            We couldn&apos;t confirm the default branch from GitHub and guessed{" "}
            <span className="font-medium">{defaultBranch}</span>. If your repo uses a different default branch, the
            config file may not have been found. Try the setup page to select the correct branch.
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

      {/* Orphan warnings */}
      {orphanedProjects.length > 0 && (
        <div className="flex flex-col gap-3">
          {orphanedProjects.map((project) => (
            <OrphanWarningCard
              key={project._id}
              project={project}
              isOwner={role === "owner" || project.userId === actingUserId}
              onResolved={handleDialogSuccess}
            />
          ))}
        </div>
      )}

      {/* Project cards */}
      {activeProjects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeProjects.map((project) => {
            const canRemove = role === "owner" || project.userId === actingUserId
            return (
              <Card key={project._id} className="flex flex-col h-full">
                <CardHeader className="pb-3 relative">
                  {/* Three-dot menu anchored to top-right — absolute so badges get the full row width */}
                  {isWriter && (project.frameworkSource === "config" || canRemove) && (
                    <div className="absolute top-3 right-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Project actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {project.frameworkSource === "config" && (
                            <DropdownMenuItem
                              onSelect={() =>
                                // Defer past the DropdownMenu close/focus-return cycle to avoid
                                // the Radix aria-hidden race: the dropdown returns focus to its
                                // trigger *before* it finishes cleanup, so opening a Dialog in
                                // the same tick leaves aria-hidden stuck on the page container.
                                setTimeout(
                                  () =>
                                    setEditProject({
                                      _id: project._id,
                                      name: project.name,
                                      contentRoot: project.contentRoot,
                                      detectedFramework: project.detectedFramework,
                                      contentType: project.contentType,
                                      branch: project.branch,
                                      configProjectId: project.configProjectId,
                                    }),
                                  0,
                                )
                              }
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {project.frameworkSource === "config" && canRemove && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setTimeout(() => setRemoveProject(project), 0)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          )}
                          {project.frameworkSource !== "config" && canRemove && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setTimeout(() => setDeleteProject(project), 0)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}

                  <div className="space-y-2 pr-8">
                    <CardTitle className="text-lg leading-tight truncate">{project.name}</CardTitle>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {project.detectedFramework && project.detectedFramework !== "custom" && (
                        <Badge variant="secondary" className="text-[10px]">
                          {project.detectedFramework}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {project.contentType}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-2 text-xs flex-wrap">
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
            )
          })}
        </div>
      ) : !orphanedProjects.length ? (
        /* Empty state — only when no active AND no orphaned projects */
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
      ) : null}

      {/* Raw Config Editor (advanced) */}
      {hasConfig && configJson && configSha && (
        <RawConfigEditor
          owner={owner}
          repo={repo}
          branch={defaultBranch}
          initialJson={configJson}
          initialSha={configSha}
          isWriter={isWriter}
          onCommitted={handleDialogSuccess}
        />
      )}

      {/* Dialogs */}
      <AddProjectDialog
        owner={owner}
        repo={repo}
        defaultBranch={defaultBranch}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={handleDialogSuccess}
      />
      <EditProjectDialog
        owner={owner}
        repo={repo}
        defaultBranch={defaultBranch}
        project={editProject}
        open={!!editProject}
        onOpenChange={(open) => {
          if (!open) setEditProject(null)
        }}
        onSuccess={handleDialogSuccess}
      />
      <RemoveProjectDialog
        owner={owner}
        repo={repo}
        defaultBranch={defaultBranch}
        project={removeProject}
        open={!!removeProject}
        onOpenChange={(open) => {
          if (!open) setRemoveProject(null)
        }}
        onSuccess={handleDialogSuccess}
      />
      <DeleteProjectDialog
        project={deleteProject}
        open={!!deleteProject}
        onOpenChange={(open) => {
          if (!open) setDeleteProject(null)
        }}
        onSuccess={handleDialogSuccess}
      />
    </div>
  )
}
