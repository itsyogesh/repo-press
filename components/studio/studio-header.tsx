import * as React from "react"
import Link from "next/link"
import {
  Home,
  MoreVertical,
  History,
  Keyboard,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { syncProjectsFromConfigAction } from "@/app/dashboard/[owner]/[repo]/actions"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import { useStudio } from "./studio-context"
import { useViewMode } from "./view-mode-context"
import { StatusActions } from "./status-actions"
import type { FileTreeNode } from "@/lib/github"

interface StudioHeaderProps {
  selectedFile: FileTreeNode | null
  contentRoot?: string
  documentId?: string
  currentStatus: string
  statusInfo: {
    label: string
    variant: "default" | "secondary" | "outline" | "destructive"
  }
  onSave: () => void
  isSaving: boolean
}

export function StudioHeader({
  selectedFile,
  contentRoot,
  documentId,
  currentStatus,
  statusInfo,
  onSave,
  isSaving,
}: StudioHeaderProps) {
  const { owner, repo, branch } = useStudio()
  const { viewMode, setViewMode, sidebarState, setSidebarState } = useViewMode()
  const [isPending, startTransition] = React.useTransition()

  const [showShortcuts, setShowShortcuts] = React.useState(false)

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
    <header className="flex h-full w-full min-w-0 items-center gap-2">
      {/* Left: Navigation & Breadcrumbs */}
      <div className="flex min-w-0 items-center gap-2 overflow-hidden flex-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            setSidebarState(sidebarState === "expanded" ? "collapsed" : "expanded")
          }}
          title={sidebarState === "expanded" ? "Collapse sidebar to rail" : "Expand sidebar"}
          aria-label={sidebarState === "expanded" ? "Collapse sidebar to rail" : "Expand sidebar"}
        >
          {sidebarState === "expanded" ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </Button>

        <Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0">
          <Link href="/dashboard">
            <Home className="h-4 w-4" />
            <span className="sr-only">Back to dashboard</span>
          </Link>
        </Button>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <Breadcrumb className="text-sm min-w-max">
            <BreadcrumbList className="flex-nowrap whitespace-nowrap">
              {pathSegments.map((seg) => (
                <React.Fragment key={`breadcrumb-${seg}`}>
                  <BreadcrumbItem>
                    <span className="text-muted-foreground">{seg}</span>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </React.Fragment>
              ))}

              <BreadcrumbItem>
                <BreadcrumbPage className="font-medium text-foreground">
                  {filename || "No file selected"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="h-8 gap-1.5"
          onClick={onSave}
          disabled={!selectedFile || isSaving}
        >
          <span className="hidden lg:inline">{isSaving ? "Saving..." : "Save"}</span>
          <span className="lg:hidden">{isSaving ? "Saving..." : "Save"}</span>
        </Button>

        {selectedFile && (
          <div className="flex items-center gap-1">
            <Badge variant={statusInfo.variant} className="capitalize">
              {statusInfo.label}
            </Badge>
            {documentId && <StatusActions documentId={documentId} currentStatus={currentStatus as any} />}
          </div>
        )}

        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(val) => {
            if (val) setViewMode(val as any)
          }}
          className="hidden bg-muted/50 p-0.5 rounded-md border border-border/50 sm:flex"
        >
          <ToggleGroupItem
            value="editor"
            className="h-7 px-2.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm"
          >
            Editor
          </ToggleGroupItem>
          <ToggleGroupItem
            value="split"
            className="h-7 px-2.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm"
          >
            Split
          </ToggleGroupItem>
        </ToggleGroup>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
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
            <DropdownMenuItem onClick={() => setShowShortcuts(true)}>
              <Keyboard className="h-4 w-4 mr-2" />
              Keyboard Shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSyncConfig} disabled={isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? "animate-spin" : ""}`} />
              Sync Config
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/${owner}/${repo}/history`}>
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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Keyboard Shortcuts</DialogTitle>
              <DialogDescription>Use shortcuts to navigate and edit without leaving the keyboard.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div>
                <h4 className="text-sm font-medium mb-2">General</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex justify-between">
                    <span>Save draft</span>
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs">⌘S</kbd>
                  </li>
                  <li className="flex justify-between">
                    <span>Toggle sidebar</span>
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs">⌘B</kbd>
                  </li>
                  <li className="flex justify-between">
                    <span>Command palette</span>
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs">⌘K</kbd>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">View</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex justify-between">
                    <span>Toggle split</span>
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs">⌘⇧P</kbd>
                  </li>
                  <li className="flex justify-between">
                    <span>Editor only</span>
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs">⌘⇧S</kbd>
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
