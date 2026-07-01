"use client"

import {
  Files,
  GitBranch,
  HelpCircle,
  History,
  Home,
  Keyboard,
  Loader2,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Save,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"
import { syncProjectsFromConfigAction } from "@/app/dashboard/[owner]/[repo]/actions"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { StatusBadge } from "@/components/ui/status-badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { DocumentStatus } from "@/lib/document-status"
import type { FileTreeNode } from "@/lib/github"
import { buildHistoryHref } from "@/lib/studio/history-link"
import { ProjectSwitcher } from "./project-switcher"
import { StatusActions } from "./status-actions"
import { useStudio } from "./studio-context"
import { StudioPageThemeToggle } from "./studio-page-theme-toggle"
import { useViewMode } from "./view-mode-context"

interface StudioHeaderProps {
  selectedFile: FileTreeNode | null
  contentRoot?: string
  documentId?: string
  currentStatus: DocumentStatus
  onSave: () => void
  isSaving: boolean
}

export function StudioHeader({
  selectedFile,
  contentRoot,
  documentId,
  currentStatus,
  onSave,
  isSaving,
}: StudioHeaderProps) {
  const { owner, repo, branch, projectId } = useStudio()
  const { viewMode, setViewMode, sidebarState, setSidebarState } = useViewMode()
  const [isPending, startTransition] = React.useTransition()

  const [showShortcuts, setShowShortcuts] = React.useState(false)
  const historyHref = buildHistoryHref({ owner, repo, branch, projectId })

  const handleSyncConfig = () => {
    startTransition(async () => {
      try {
        const res = await syncProjectsFromConfigAction(owner, repo, branch)
        if (res.success) {
          toast.success("Project configuration synced from repository")
        } else {
          toast.error(res.error || "Failed to sync configuration")
        }
      } catch (err: any) {
        toast.error(err.message || "An unexpected error occurred")
      }
    })
  }

  // Build breadcrumbs from content path only.
  let pathSegments = selectedFile ? selectedFile.path.split("/") : []
  if (contentRoot && selectedFile?.path.startsWith(`${contentRoot}/`)) {
    pathSegments = selectedFile.path.slice(contentRoot.length + 1).split("/")
    pathSegments = [...contentRoot.split("/"), ...pathSegments]
  }
  const filename = pathSegments.pop()

  return (
    <header className="flex h-full w-full min-w-0 items-center gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-studio-border/70 bg-studio-canvas-inset/70 p-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => {
              setSidebarState(sidebarState === "expanded" ? "collapsed" : "expanded")
            }}
            title={sidebarState === "expanded" ? "Collapse sidebar to rail" : "Expand sidebar"}
            aria-label={sidebarState === "expanded" ? "Collapse sidebar to rail" : "Expand sidebar"}
          >
            {sidebarState === "expanded" ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>

          <Button variant="ghost" size="icon" asChild className="h-8 w-8 rounded-lg">
            <Link href={`/dashboard/${owner}/${repo}`}>
              <Home className="h-4 w-4" />
              <span className="sr-only">Back to project hub</span>
            </Link>
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md border border-studio-border/70 bg-studio-canvas-inset/45 px-3 py-2">
          <div className="hidden shrink-0 items-center gap-2 rounded-full border border-studio-border/60 bg-studio-canvas px-2.5 py-1 font-mono text-[11px] font-medium text-studio-fg-muted xl:flex">
            <span className="truncate text-studio-fg">
              {owner}/{repo}
            </span>
            <span className="h-1 w-1 rounded-full bg-studio-border" />
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {branch}
            </span>
          </div>

          <div className="min-w-0 flex-1 overflow-x-auto">
            <Breadcrumb className="min-w-max font-mono text-sm">
              <BreadcrumbList className="flex-nowrap whitespace-nowrap">
                {pathSegments.map((seg) => (
                  <React.Fragment key={`breadcrumb-${seg}`}>
                    <BreadcrumbItem>
                      <span className="text-studio-fg-muted">{seg}</span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </React.Fragment>
                ))}

                <BreadcrumbItem>
                  <BreadcrumbPage className="font-medium text-studio-fg">
                    {filename || "No file selected"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {selectedFile && (
          <div className="hidden items-center gap-1 rounded-md border border-studio-border/70 bg-studio-canvas-inset/50 px-2.5 py-1.5 lg:flex">
            <StatusBadge status={currentStatus} />
            {documentId && <StatusActions documentId={documentId} currentStatus={currentStatus as any} />}
          </div>
        )}

        {projectId ? <ProjectSwitcher currentProjectId={projectId} owner={owner} repo={repo} branch={branch} /> : null}

        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(val) => {
            if (val) setViewMode(val as any)
          }}
          className="hidden rounded-md border border-studio-border/70 bg-studio-canvas-inset/50 p-1 md:flex"
        >
          <ToggleGroupItem value="editor" className="h-7 rounded-sm px-2.5 text-xs data-[state=on]:bg-studio-canvas">
            Editor
          </ToggleGroupItem>
          <ToggleGroupItem value="split" className="h-7 rounded-sm px-2.5 text-xs data-[state=on]:bg-studio-canvas">
            Split
          </ToggleGroupItem>
        </ToggleGroup>

        <Button
          variant="default"
          size="sm"
          className="h-9 gap-2 rounded-md bg-studio-accent px-3 text-studio-accent-fg hover:bg-studio-accent/90"
          onClick={onSave}
          disabled={!selectedFile || isSaving}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>{isSaving ? "Saving…" : "Save draft"}</span>
        </Button>

        <StudioPageThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-md border border-studio-border/70 bg-studio-canvas-inset/45 hover:bg-studio-canvas-inset"
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setSidebarState(sidebarState === "expanded" ? "collapsed" : "expanded")
              }}
            >
              {sidebarState === "expanded" ? (
                <PanelLeftClose className="h-4 w-4 mr-2" />
              ) : (
                <PanelLeftOpen className="h-4 w-4 mr-2" />
              )}
              {sidebarState === "expanded" ? "Collapse to Rail" : "Expand Sidebar"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTimeout(() => setShowShortcuts(true), 0)}>
              <Keyboard className="h-4 w-4 mr-2" />
              Keyboard Shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSyncConfig} disabled={isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? "animate-spin" : ""}`} />
              Sync Config
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/${owner}/${repo}/files?branch=${branch}`}>
                <Files className="h-4 w-4 mr-2" />
                Browse All Files
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={historyHref}>
                <History className="h-4 w-4 mr-2" />
                History
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="https://repopress.dev/docs" target="_blank" rel="noopener noreferrer">
                <HelpCircle className="h-4 w-4 mr-2" />
                Help
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
          <DialogContent
            className="max-w-lg"
            // Same Radix aria-hidden race fix - opened from DropdownMenuItem, see edit-project-dialog.tsx for details.
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Keyboard Shortcuts</DialogTitle>
              <DialogDescription>Use shortcuts to navigate and edit without leaving the keyboard.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 md:grid-cols-2">
              <div className="rounded-md border border-studio-border/70 bg-studio-canvas-inset/35 p-4">
                <h4 className="mb-3 text-sm font-medium text-studio-fg">General</h4>
                <ul className="space-y-2 text-sm text-studio-fg-muted">
                  <li className="flex justify-between">
                    <span>Save draft</span>
                    <kbd className="rounded-md border border-studio-border bg-studio-canvas px-2 py-0.5 text-xs text-studio-fg">
                      ⌘S
                    </kbd>
                  </li>
                  <li className="flex justify-between">
                    <span>Toggle sidebar</span>
                    <kbd className="rounded-md border border-studio-border bg-studio-canvas px-2 py-0.5 text-xs text-studio-fg">
                      ⌘B
                    </kbd>
                  </li>
                  <li className="flex justify-between">
                    <span>Command palette</span>
                    <kbd className="rounded-md border border-studio-border bg-studio-canvas px-2 py-0.5 text-xs text-studio-fg">
                      ⌘K
                    </kbd>
                  </li>
                  <li className="flex justify-between">
                    <span>Insert component</span>
                    <kbd className="rounded-md border border-studio-border bg-studio-canvas px-2 py-0.5 text-xs text-studio-fg">
                      ⌘J
                    </kbd>
                  </li>
                </ul>
              </div>
              <div className="rounded-md border border-studio-border/70 bg-studio-canvas-inset/35 p-4">
                <h4 className="mb-3 text-sm font-medium text-studio-fg">View</h4>
                <ul className="space-y-2 text-sm text-studio-fg-muted">
                  <li className="flex justify-between">
                    <span>Toggle split</span>
                    <kbd className="rounded-md border border-studio-border bg-studio-canvas px-2 py-0.5 text-xs text-studio-fg">
                      ⌘⇧P
                    </kbd>
                  </li>
                  <li className="flex justify-between">
                    <span>Editor only</span>
                    <kbd className="rounded-md border border-studio-border bg-studio-canvas px-2 py-0.5 text-xs text-studio-fg">
                      ⌘⇧S
                    </kbd>
                  </li>
                </ul>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  )
}
