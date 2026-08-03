"use client"

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
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
import { cleanUpAllOrphansAction } from "@/app/dashboard/[owner]/[repo]/config-actions"
import { formatUtcDate } from "@/lib/format-date"
import { retrySyncAction } from "@/lib/sync-projects"
import { cn } from "@/lib/utils"
import { AddProjectDialog } from "./add-project-dialog"
import { DeleteProjectDialog } from "./delete-project-dialog"
import { type EditableProject, EditProjectDialog } from "./edit-project-dialog"
import { OrphanWarningCard } from "./orphan-warning-card"
import { RawConfigEditor } from "./raw-config-editor"
import { RemoveProjectDialog } from "./remove-project-dialog"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
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
  projectAccessTokens?: Record<string, string>
}

function HubProjectCard({
  owner,
  repo,
  defaultBranch,
  project,
  projectAccessToken,
  isWriter,
  canRemove,
  onEdit,
  onRemove,
  onDelete,
}: {
  owner: string
  repo: string
  defaultBranch: string
  project: HubProject
  projectAccessToken?: string
  isWriter: boolean
  canRemove: boolean
  onEdit: (project: EditableProject) => void
  onRemove: (project: HubProject) => void
  onDelete: (project: HubProject) => void
}) {
  const canManage = isWriter && (project.frameworkSource === "config" || canRemove)
  const updatedOn = formatUtcDate(project.updatedAt)

  return (
    <article className="flex h-full flex-col rounded-lg border border-border bg-background p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
            {project.contentRoot || "Repository root"}
          </p>
          <h3 className="mt-3 truncate rp-display text-xl">{project.name}</h3>
        </div>

        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-2 -mt-2">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Project actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {project.frameworkSource === "config" ? (
                <DropdownMenuItem
                  onSelect={() =>
                    setTimeout(
                      () =>
                        onEdit({
                          _id: project._id,
                          name: project.name,
                          contentRoot: project.contentRoot,
                          detectedFramework: project.detectedFramework,
                          contentType: project.contentType,
                          branch: project.branch,
                          configProjectId: project.configProjectId,
                          projectAccessToken,
                        }),
                      0,
                    )
                  }
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              ) : null}

              {project.frameworkSource === "config" && canRemove ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setTimeout(() => onRemove(project), 0)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </DropdownMenuItem>
              ) : null}

              {project.frameworkSource !== "config" && canRemove ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setTimeout(() => onDelete(project), 0)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {project.detectedFramework && project.detectedFramework !== "custom" ? (
          <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.16em]">
            {project.detectedFramework}
          </Badge>
        ) : null}
        <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
          {project.contentType}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
          {project.frameworkSource === "config" ? "Config-synced" : "Manual"}
        </span>
        {project.branch !== defaultBranch ? (
          <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
            Branch {project.branch}
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-3 text-sm text-muted-foreground">
        <p className="inline-flex items-center gap-1.5">
          <Folder className="h-3.5 w-3.5" />
          <span className="truncate">{project.contentRoot || "Repository root"}</span>
        </p>
        <p className="inline-flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          <span>{project.branch}</span>
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 pt-6">
        <p className="text-xs text-muted-foreground">
          Updated{" "}
          {project.updatedAt ? <time dateTime={new Date(project.updatedAt).toISOString()}>{updatedOn}</time> : "N/A"}
        </p>

        <Button asChild variant="ghost" size="sm" className="-mr-2 px-2 text-foreground hover:bg-muted/70">
          <Link href={`/dashboard/${owner}/${repo}/studio?branch=${project.branch}&projectId=${project._id}`}>
            Open Studio
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  )
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
  projectAccessTokens,
}: RepoProjectHubProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [editProject, setEditProject] = useState<EditableProject | null>(null)
  const [removeProject, setRemoveProject] = useState<HubProject | null>(null)
  const [deleteProject, setDeleteProject] = useState<HubProject | null>(null)

  const { activeProjects, orphanedProjects } = useMemo(() => {
    const active: HubProject[] = []
    const orphaned: HubProject[] = []

    for (const project of projects) {
      if (project.configRemoved) {
        orphaned.push(project)
      } else {
        active.push(project)
      }
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

  const handleCleanUpAll = () => {
    startTransition(async () => {
      try {
        const result = await cleanUpAllOrphansAction(owner, repo)
        if (result.success) {
          const message =
            result.remaining > 0
              ? `Queued cleanup for ${result.removed} orphaned project${result.removed !== 1 ? "s" : ""} (${result.remaining} remaining)`
              : `Queued cleanup for ${result.removed} orphaned project${result.removed !== 1 ? "s" : ""}`
          toast.success(message)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to clean up orphans")
      }
    })
  }

  const handleDialogSuccess = () => {
    router.refresh()
  }

  const configStatus = hasConfig
    ? configSynced
      ? "Config-synced"
      : "Config found"
    : activeProjects.length > 0
      ? "Manual"
      : "Not set up"
  const configDescription = hasConfig
    ? configSynced
      ? "Projects sync from repopress.config.json and stay grouped around this repository."
      : "A config file was found, but the last sync needs attention before the hub is fully current."
    : activeProjects.length > 0
      ? "This repository is being managed manually. You can keep working without a config file."
      : "Start with setup to connect content roots, sync config, and create the first project."

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg border border-border bg-background p-6 sm:p-8">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="-ml-2 w-fit px-2 text-muted-foreground hover:bg-muted/70"
            >
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </Link>
            </Button>

            <p className="mt-5 font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">
              Repository hub
            </p>
            <p className="mt-4 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">{owner}</p>
            <h1 className="rp-display mt-2 text-3xl sm:text-4xl">{repo}</h1>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">{configDescription}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.16em]">
                {role}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.16em]"
                title={defaultBranchInferred ? "Branch detected heuristically - verify this is correct" : undefined}
              >
                <GitBranch className="h-3.5 w-3.5" />
                {defaultBranch}
                {defaultBranchInferred ? <AlertCircle className="h-3.5 w-3.5 text-studio-attention" /> : null}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.16em]",
                  hasConfig && configSynced && "border-studio-success/20 bg-studio-success-muted text-studio-success",
                  hasConfig &&
                    !configSynced &&
                    "border-studio-attention/20 bg-studio-attention-muted text-studio-attention",
                )}
              >
                {hasConfig ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
                {configStatus}
              </Badge>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:flex-col">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/${owner}/${repo}/files?branch=${defaultBranch}`}>
                <Files className="h-4 w-4" />
                Browse Files
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/${owner}/${repo}/history`}>
                <Clock className="h-4 w-4" />
                History
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/${owner}/${repo}/settings`}>
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border/70 bg-background/80 p-4">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">Projects</p>
            <p className="mt-3 font-mono text-2xl font-medium tabular-nums text-foreground">{activeProjects.length}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Active editing surfaces connected to this repository.
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-background/80 p-4">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
              Needs attention
            </p>
            <p className="mt-3 font-mono text-2xl font-medium tabular-nums text-foreground">
              {orphanedProjects.length}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Projects removed from config but still present until cleaned up.
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-background/80 p-4">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">Access</p>
            <p className="mt-3 font-mono text-2xl font-medium capitalize text-foreground">{role}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {isWriter
                ? "You can add or modify projects in this repository."
                : "You can view the repository hub and open Studio."}
            </p>
          </div>
        </div>
      </section>

      {defaultBranchInferred && projects.length === 0 && !syncError ? (
        <Alert className="border-studio-attention/20 bg-studio-attention-muted/60">
          <AlertCircle className="h-4 w-4 text-studio-attention" />
          <AlertTitle className="text-studio-attention text-sm">Branch may be incorrect</AlertTitle>
          <AlertDescription className="text-xs text-studio-attention">
            We couldn&apos;t confirm the default branch from GitHub and guessed{" "}
            <span className="font-medium">{defaultBranch}</span>. If your repo uses a different default branch, the
            config file may not have been found. Try the setup page to select the correct branch.
          </AlertDescription>
        </Alert>
      ) : null}

      {syncError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sync Error</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{syncError}</span>
            <Button variant="outline" size="sm" onClick={handleRetrySync} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isPending ? "Syncing..." : "Retry Sync"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {orphanedProjects.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">
                Needs attention
              </p>
              <h2 className="mt-2 rp-display text-2xl">Removed from config</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                These projects were removed from the repository config but still exist in RepoPress until cleaned up.
              </p>
            </div>
            {role === "owner" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCleanUpAll}
                disabled={isPending}
                className="text-destructive hover:text-destructive"
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remove All
              </Button>
            ) : null}
          </div>

          {orphanedProjects.map((project) => (
            <OrphanWarningCard
              key={project._id}
              project={project}
              isOwner={role === "owner" || project.userId === actingUserId}
              onResolved={handleDialogSuccess}
            />
          ))}
        </section>
      ) : null}

      <section className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">Projects</p>
            <h2 className="mt-2 rp-display text-2xl">
              {activeProjects.length > 0 ? "Content surfaces for this repository" : "No projects connected yet"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {activeProjects.length > 0
                ? "Open Studio for active work, or use setup and config tools when the repository needs structural changes."
                : hasConfig && syncError
                  ? "A config file exists, but sync needs to succeed before projects can appear here."
                  : "Use setup to connect the repository, then projects will appear here as your working surfaces."}
            </p>
          </div>

          {isWriter && hasConfig ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Project
            </Button>
          ) : null}
        </div>

        {activeProjects.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {activeProjects.map((project) => {
              const canRemove = role === "owner" || project.userId === actingUserId

              return (
                <HubProjectCard
                  key={project._id}
                  owner={owner}
                  repo={repo}
                  defaultBranch={defaultBranch}
                  project={project}
                  projectAccessToken={projectAccessTokens?.[project._id]}
                  isWriter={isWriter}
                  canRemove={canRemove}
                  onEdit={setEditProject}
                  onRemove={setRemoveProject}
                  onDelete={setDeleteProject}
                />
              )
            })}
          </div>
        ) : !orphanedProjects.length ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background text-muted-foreground">
              <Folder className="h-5 w-5" />
            </div>
            <h3 className="mt-5 rp-display text-lg">No projects found</h3>
            {hasConfig && syncError ? (
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                A config file was found but sync failed. Retry sync, then come back here to open the generated projects.
              </p>
            ) : (
              <>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Set up this repository to start managing content with RepoPress.
                </p>
                <Button asChild className="mt-6">
                  <Link href={`/dashboard/${owner}/${repo}/setup`}>
                    Set up this repository
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        ) : null}
      </section>

      {hasConfig && configJson && configSha ? (
        <RawConfigEditor
          owner={owner}
          repo={repo}
          branch={defaultBranch}
          initialJson={configJson}
          initialSha={configSha}
          isWriter={isWriter}
          onCommitted={handleDialogSuccess}
        />
      ) : null}

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
          if (!open) {
            setEditProject(null)
          }
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
          if (!open) {
            setRemoveProject(null)
          }
        }}
        onSuccess={handleDialogSuccess}
      />
      <DeleteProjectDialog
        project={deleteProject}
        open={!!deleteProject}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteProject(null)
          }
        }}
        onSuccess={handleDialogSuccess}
      />
    </div>
  )
}
