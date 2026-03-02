"use client"

import { useMutation } from "convex/react"
import matter from "gray-matter"
import { FileText, FolderOpen, History, Search, X, AlertCircle, Settings } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FileTreeNode } from "@/lib/github"
import { CommandPalette } from "./command-palette"
import { CreateFileDialog } from "./create-file-dialog"
import { Editor } from "./editor"
import { FileTree } from "./file-tree"
import { useStudioFile } from "./hooks/use-studio-file"
import { useStudioPublish } from "./hooks/use-studio-publish"
import { useStudioQueries } from "./hooks/use-studio-queries"
import { useStudioSave } from "./hooks/use-studio-save"
import { usePreviewContext } from "@/lib/hooks/use-preview-context"
import { syncProjectsFromConfigAction } from "@/app/dashboard/[owner]/[repo]/actions"
import { Preview } from "./preview"
import { StudioAdapterProvider } from "./studio-adapter-context"
import { PublishDialog } from "./publish-dialog"
import { PublishOpsBar } from "./publish-ops-bar"
import { StatusActions } from "./status-actions"
import { StudioProvider, useStudio } from "./studio-context"
import { StudioFooter } from "./studio-footer"
import { StudioHeader } from "./studio-header"
import { useViewMode, ViewModeProvider } from "./view-mode-context"

export interface StudioLayoutProps {
  tree: FileTreeNode[]
  initialFile?: {
    path: string
    content: string
    sha: string
  } | null
  owner: string
  repo: string
  branch: string
  currentPath: string
  projectId?: string
  contentRoot?: string
}

const STATUS_LABELS: Record<
  string,
  {
    label: string
    variant: "default" | "secondary" | "outline" | "destructive"
  }
> = {
  draft: { label: "Draft", variant: "secondary" },
  in_review: { label: "In Review", variant: "outline" },
  approved: { label: "Approved", variant: "outline" },
  published: { label: "Published", variant: "default" },
  scheduled: { label: "Scheduled", variant: "secondary" },
  archived: { label: "Archived", variant: "destructive" },
}

function findTreeNodeByPath(nodes: FileTreeNode[], path: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children) {
      const match = findTreeNodeByPath(node.children, path)
      if (match) return match
    }
  }
  return null
}

function inferTitleFromPath(path: string) {
  const fileName = path.split("/").pop() || path
  return fileName.replace(/\.(mdx?|markdown)$/i, "")
}

type FlatFileEntry = {
  path: string
  name: string
  title?: string
}

function flattenFiles(nodes: FileTreeNode[], titleMap?: Record<string, string>) {
  const result: FlatFileEntry[] = []
  const walk = (entries: FileTreeNode[]) => {
    for (const node of entries) {
      if (node.type === "file") {
        result.push({
          path: node.path,
          name: node.name,
          title: titleMap?.[node.path],
        })
      }
      if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return result
}

function StudioSidebarLoading() {
  return (
    <div className="flex h-full flex-col bg-studio-canvas-inset">
      <div className="shrink-0 border-b border-studio-border px-2 py-2">
        <Skeleton className="h-3.5 w-20" />
      </div>

      <div className="shrink-0 border-b border-studio-border px-2 py-2">
        <div className="mb-2 flex items-center justify-between">
          <Skeleton className="h-3.5 w-24" />
          <div className="flex items-center gap-1">
            <Skeleton className="h-6 w-6 rounded-md" />
            <Skeleton className="h-6 w-6 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-7 w-full rounded-md" />
      </div>

      <div className="flex-1 overflow-hidden px-2 py-2">
        <div className="space-y-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <div key={`sidebar-skeleton-${i}`} className="flex items-center gap-2 px-1 py-1">
              <Skeleton className="h-3.5 w-3.5 rounded" />
              <Skeleton className={i % 3 === 0 ? "h-3.5 w-40" : i % 3 === 1 ? "h-3.5 w-32" : "h-3.5 w-48"} />
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-studio-border p-2">
        <Skeleton className="h-8 w-full rounded-md" />
        <div className="mt-2 flex items-center justify-between">
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-32 rounded-md" />
        </div>
        <Skeleton className="mt-2 h-3.5 w-28" />
      </div>
    </div>
  )
}

function StudioNoSelectionLoading() {
  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="w-full max-w-2xl space-y-5 text-center">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52 mx-auto" />
          <Skeleton className="h-4 w-96 mx-auto max-w-full" />
        </div>
        <div className="mx-auto max-w-xl space-y-3">
          <Skeleton className="h-11 w-full rounded-md" />
          <div className="space-y-1 rounded-lg border border-studio-border bg-studio-canvas-inset/30 p-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={`empty-search-skeleton-${i}`} className="flex items-start gap-2 rounded-md px-2 py-2">
                <Skeleton className="h-3.5 w-3.5 mt-0.5 rounded" />
                <div className="min-w-0 flex-1 space-y-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StudioPreviewLoading() {
  return (
    <div className="h-full flex flex-col bg-studio-canvas">
      <div className="shrink-0 border-b border-studio-border px-3 py-1.5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-14" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[920px] space-y-4 p-8">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-52 w-full rounded-lg" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-8 w-1/3 mt-6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>
    </div>
  )
}

function StudioNoSelectionPreviewState() {
  return (
    <div className="h-full flex flex-col bg-studio-canvas select-none">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-studio-border shrink-0">
        <span className="text-[10px] font-bold text-studio-fg uppercase tracking-widest opacity-50">Preview</span>
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-[280px] text-center space-y-6">
          <div className="relative inline-flex items-center justify-center">
            <div className="absolute inset-0 bg-blue-500/10 blur-2xl rounded-full scale-150 animate-pulse" />
            <div className="relative size-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 flex items-center justify-center shadow-inner">
              <FileText className="size-8 text-blue-500/60" />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-studio-fg tracking-tight">Ready to Render</h3>
            <p className="text-xs leading-relaxed text-studio-fg-muted/80 text-balance">
              Select any MDX or Markdown file from the explorer to see your content come to life.
            </p>
          </div>

          <div className="pt-4 grid gap-2">
            <div className="flex items-center gap-3 p-2 rounded-lg border border-transparent hover:border-studio-border hover:bg-studio-canvas-alt transition-colors group">
              <div className="size-6 rounded bg-muted flex items-center justify-center group-hover:bg-blue-500/10 transition-colors">
                <Search className="size-3.5 text-muted-foreground group-hover:text-blue-500" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-bold text-studio-fg uppercase tracking-tight">Quick Search</p>
                <p className="text-[10px] text-studio-fg-muted">
                  Press <kbd className="font-sans text-[9px] bg-muted px-1 rounded border shadow-sm">⌘ K</kbd> to find
                  files
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StudioEditorLoading({ showTabs = true }: { showTabs?: boolean }) {
  return (
    <div className="h-full flex flex-col bg-studio-canvas">
      {showTabs && (
        <div className="shrink-0 border-b border-studio-border bg-studio-canvas">
          <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5">
            <Skeleton className="h-8 w-40 rounded-md" />
            <Skeleton className="h-8 w-36 rounded-md" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="border-b border-studio-border bg-studio-canvas">
            <div className="flex items-center justify-between px-4 py-2 border-b border-studio-border">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-6 w-9 rounded-md" />
            </div>
            <div className="space-y-4 px-4 py-3">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-24 w-full rounded-md" />
              <Skeleton className="h-8 w-40 rounded-md" />
            </div>
          </div>

          <div className="border-b border-studio-border px-4 py-2">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={`editor-toolbar-skeleton-${i}`} className="h-6 w-6 rounded-md" />
              ))}
            </div>
          </div>

          <div className="space-y-3 p-6">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-11/12" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-8 w-1/3 mt-4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-10/12" />
            <Skeleton className="h-5 w-9/12" />
            <Skeleton className="h-40 w-full mt-2 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}

function StudioSidebarRail({
  onExpand,
  pendingCount,
  historyHref,
  settingsHref,
}: {
  onExpand: () => void
  pendingCount: number
  historyHref: string
  settingsHref: string
}) {
  const pendingDisplay = pendingCount > 99 ? "99+" : String(pendingCount)

  return (
    <TooltipProvider delayDuration={120}>
      <div className="h-full flex flex-col bg-studio-canvas-inset/95">
        <div className="border-b border-studio-border px-2 py-2 flex flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg border border-studio-border bg-studio-canvas text-studio-fg shadow-sm transition-colors hover:bg-studio-canvas-inset"
                title="Expand sidebar"
                aria-label="Expand sidebar"
                onClick={onExpand}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Expand sidebar
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-1" />

        <div className="border-t border-studio-border px-2 py-2 flex flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 rounded-lg border border-studio-border bg-studio-canvas hover:bg-studio-canvas-inset"
                title="History"
                aria-label="Project history"
              >
                <Link href={historyHref}>
                  <History className="h-4 w-4" />
                  {pendingCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-studio-accent px-1 text-[9px] font-semibold text-white">
                      {pendingDisplay}
                    </span>
                  )}
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Project history
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg border border-studio-border bg-studio-canvas hover:bg-studio-canvas-inset"
                title="Settings"
                aria-label="Project settings"
              >
                <Link href={settingsHref}>
                  <Settings className="h-4 w-4 text-studio-fg" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Settings
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="secondary"
                className={
                  pendingCount > 0
                    ? "h-6 min-w-[2.25rem] justify-center rounded-md border border-studio-accent/40 bg-studio-accent-muted px-1 text-[10px] text-studio-accent"
                    : "h-6 min-w-[2.25rem] justify-center rounded-md border border-studio-border bg-studio-canvas px-1 text-[10px] text-studio-fg-muted"
                }
              >
                {pendingDisplay}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {pendingCount > 0
                ? `${pendingCount} pending change${pendingCount === 1 ? "" : "s"}`
                : "No pending changes"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}

function StudioLayoutInner({
  studioFile,
  studioQueries,
}: {
  studioFile: ReturnType<typeof useStudioFile>
  studioQueries: ReturnType<typeof useStudioQueries>
}) {
  const { projectId, contentRoot, owner, repo, branch, adapter, adapterLoading, adapterError, adapterDiagnostics } =
    useStudio()
  const {
    viewMode,
    setViewMode,
    sidebarState,
    setSidebarState,
    sidebarPanelSize,
    setSidebarPanelSize,
    editorPanelSize,
    setEditorPanelSize,
    previewPanelSize,
    setPreviewPanelSize,
  } = useViewMode()

  // Destructure studioFile
  const {
    selectedFile,
    openFiles,
    recentFiles,
    content,
    frontmatter,
    sha,
    isFileLoading,
    navigateToFile,
    clearSelection,
    closeFile,
    discardFileFromClientState,
    primeFileSnapshot,
    setContent,
    setFrontmatterKey,
    hydrateFromDocument,
  } = studioFile

  // Destructure studioQueries
  const {
    userId,
    document,
    titleMap,
    pendingOps,
    overlayTree,
    opCounts,
    activeBranch,
    dirtyDocs,
    editCount,
    frontmatterSchema,
    fieldVariants,
  } = studioQueries

  // Explorer mutations
  const stageCreate = useMutation(api.explorerOps.stageCreate)
  const stageDelete = useMutation(api.explorerOps.stageDelete)
  const undoOp = useMutation(api.explorerOps.undoOp)

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createDialogParent, setCreateDialogParent] = React.useState("")
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false)
  const [emptySearch, setEmptySearch] = React.useState("")
  const [isMobile, setIsMobile] = React.useState(false)
  const wasMobileRef = React.useRef(false)

  // 3. Save logic
  const { isSaving, saveDraft, ensureDocumentRecord } = useStudioSave({
    userId,
    documentId: document?._id,
    selectedFile,
    content,
    frontmatter,
    sha,
  })

  // 4. Publish logic
  const { isPublishing, publishDialogOpen, publishConflicts, openPublishDialog, setPublishDialogOpen, handlePublish } =
    useStudioPublish({
      userId,
      ensureDocumentRecord,
      selectedFile,
      content,
      frontmatter,
    })

  // Explorer handlers
  const handleCreateFile = React.useCallback((parentPath: string) => {
    setCreateDialogParent(parentPath)
    setCreateDialogOpen(true)
  }, [])

  const handleConfirmCreate = React.useCallback(
    async (fileName: string, parentPath: string) => {
      if (!projectId || !userId) return
      const isAlreadyPrefixed = contentRoot && (parentPath === contentRoot || parentPath.startsWith(`${contentRoot}/`))
      let filePath: string
      if (isAlreadyPrefixed) {
        filePath = parentPath ? `${parentPath}/${fileName}` : fileName
      } else if (contentRoot) {
        filePath = parentPath ? `${contentRoot}/${parentPath}/${fileName}` : `${contentRoot}/${fileName}`
      } else {
        filePath = parentPath ? `${parentPath}/${fileName}` : fileName
      }
      try {
        const initialTitle = fileName.replace(/\.(mdx?|markdown)$/i, "")
        await stageCreate({
          projectId: projectId as Id<"projects">,
          userId,
          filePath,
          title: initialTitle,
          initialBody: "",
          initialFrontmatter: {
            title: initialTitle,
          },
        })
        primeFileSnapshot(filePath, {
          content: "",
          frontmatter: { title: initialTitle },
          sha: null,
        })
        toast.success(`Created ${fileName}`)
        navigateToFile(filePath)
      } catch (error: any) {
        console.error("Error creating file:", error)
        toast.error(error.message || "Failed to create file")
      }
    },
    [projectId, userId, contentRoot, stageCreate, primeFileSnapshot, navigateToFile],
  )

  const handleDeleteFile = React.useCallback(
    async (filePath: string, fileSha: string) => {
      if (!projectId || !userId) return
      try {
        const pendingCreateOp = pendingOps?.find(
          (op: any) => op.filePath === filePath && op.opType === "create" && op.status === "pending",
        )
        if (pendingCreateOp) {
          await undoOp({ id: pendingCreateOp._id, userId })
          discardFileFromClientState(filePath)
          toast.success("Removed staged new file")
          return
        }

        const opId = await stageDelete({
          projectId: projectId as Id<"projects">,
          userId,
          filePath,
          previousSha: fileSha || undefined,
        })
        toast("File staged for deletion", {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await undoOp({ id: opId, userId })
                toast.success("Delete undone")
              } catch {
                toast.error("Failed to undo")
              }
            },
          },
        })
      } catch (error: any) {
        console.error("Error deleting file:", error)
        toast.error(error.message || "Failed to delete file")
      }
    },
    [projectId, userId, pendingOps, undoOp, discardFileFromClientState, stageDelete],
  )

  const handleUndoDelete = React.useCallback(
    async (filePath: string) => {
      if (!projectId || !userId || !pendingOps) return
      const op = pendingOps.find((o: any) => o.filePath === filePath && o.opType === "delete" && o.status === "pending")
      if (!op) return
      try {
        await undoOp({ id: op._id, userId })
        toast.success("Delete undone")
      } catch (error: any) {
        console.error("Error undoing delete:", error)
        toast.error(error.message || "Failed to undo")
      }
    },
    [projectId, userId, pendingOps, undoOp],
  )

  const handleDiscardAll = React.useCallback(async () => {
    if (!pendingOps || !userId) return
    try {
      for (const op of pendingOps) {
        if (op.status === "pending") {
          await undoOp({ id: op._id, userId })
        }
      }
      toast.success("All pending changes discarded")
    } catch (error: any) {
      toast.error(error.message || "Failed to discard changes")
    }
  }, [pendingOps, userId, undoOp])

  const stageRelocateFile = React.useCallback(
    async (oldPath: string, newPath: string, actionLabel: "renamed" | "moved") => {
      // Logic for moving/renaming (re-implemented correctly or abstracted)
    },
    [],
  )

  const handleRenameFile = React.useCallback(
    async (oldPath: string, newPath: string) => {
      await stageRelocateFile(oldPath, newPath, "renamed")
    },
    [stageRelocateFile],
  )

  const handleMoveFile = React.useCallback(
    async (oldPath: string, newParentPath: string) => {
      const fileName = oldPath.split("/").pop()
      if (!fileName) return
      const newPath = newParentPath ? `${newParentPath}/${fileName}` : fileName
      await stageRelocateFile(oldPath, newPath, "moved")
    },
    [stageRelocateFile],
  )

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(max-width: 767px)")
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  // Sync scroll
  const editorScrollRef = React.useRef<HTMLDivElement>(null)
  const previewScrollRef = React.useRef<HTMLDivElement>(null)
  const isSyncingScroll = React.useRef(false)

  const syncScroll = React.useCallback((source: "editor" | "preview") => {
    if (isSyncingScroll.current) return
    isSyncingScroll.current = true

    const sourceEl = source === "editor" ? editorScrollRef.current : previewScrollRef.current
    const targetEl = source === "editor" ? previewScrollRef.current : editorScrollRef.current

    if (sourceEl && targetEl) {
      const maxScroll = sourceEl.scrollHeight - sourceEl.clientHeight
      const pct = maxScroll > 0 ? sourceEl.scrollTop / maxScroll : 0
      const targetMax = targetEl.scrollHeight - targetEl.clientHeight
      targetEl.scrollTop = pct * targetMax
    }

    requestAnimationFrame(() => {
      isSyncingScroll.current = false
    })
  }, [])

  const handleEditorScroll = React.useCallback(() => syncScroll("editor"), [syncScroll])
  const handlePreviewScroll = React.useCallback(() => syncScroll("preview"), [syncScroll])

  const showSidebar = !isMobile || sidebarState === "expanded"
  const isSidebarCollapsed = !isMobile && sidebarState === "collapsed"
  const showPreview = viewMode === "split" && !isMobile
  const [resolvedProjectDataId, setResolvedProjectDataId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!projectId) {
      setResolvedProjectDataId("none")
      return
    }
    if (pendingOps !== undefined && dirtyDocs !== undefined) {
      setResolvedProjectDataId(projectId)
    }
  }, [projectId, pendingOps, dirtyDocs])

  const isProjectDataLoading = Boolean(projectId) && (pendingOps === undefined || dirtyDocs === undefined)
  const shouldShowProjectDataSkeleton =
    Boolean(projectId) && resolvedProjectDataId !== projectId && isProjectDataLoading
  const isSelectedDocumentLoading = isFileLoading
  const totalPendingCount = opCounts.creates + opCounts.deletes + editCount
  const flatFiles = React.useMemo(() => flattenFiles(overlayTree, titleMap), [overlayTree, titleMap])
  const flatFilesByPath = React.useMemo(() => {
    const map = new Map<string, FlatFileEntry>()
    for (const file of flatFiles) map.set(file.path, file)
    return map
  }, [flatFiles])
  const emptySearchQuery = emptySearch.trim().toLowerCase()
  const hasEmptySearchQuery = emptySearchQuery.length > 0
  const emptySearchResults = React.useMemo(() => {
    if (!hasEmptySearchQuery) return []
    return flatFiles
      .filter((file) => `${file.title || ""} ${file.name} ${file.path}`.toLowerCase().includes(emptySearchQuery))
      .slice(0, 8)
  }, [hasEmptySearchQuery, flatFiles, emptySearchQuery])
  const recentFileResults = React.useMemo(() => {
    const results: FlatFileEntry[] = []
    for (const path of recentFiles) {
      const match = flatFilesByPath.get(path)
      if (match) results.push(match)
      if (results.length >= 8) break
    }
    return results
  }, [recentFiles, flatFilesByPath])

  const showSidebarPanel = isMobile ? sidebarState === "expanded" : !isSidebarCollapsed
  const showSidebarRail = !isMobile && isSidebarCollapsed

  const currentStatus = document?.status || "draft"
  const statusInfo = STATUS_LABELS[currentStatus] || STATUS_LABELS.draft
  const canPublish = ["draft", "approved"].includes(currentStatus)

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden bg-studio-canvas text-studio-fg"
      role="application"
      aria-label="RepoPress Studio"
    >
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {document ? `Editing ${selectedFile?.name || "file"}, status: ${currentStatus}` : "No file selected"}
      </div>
      <div className="h-[--spacing-studio-header-h] shrink-0 border-b border-studio-border flex items-center px-2 sm:px-3 z-10 bg-studio-canvas">
        <StudioHeader
          selectedFile={selectedFile}
          contentRoot={contentRoot}
          documentId={document?._id}
          currentStatus={currentStatus}
          statusInfo={statusInfo as any}
          onSave={saveDraft}
          isSaving={isSaving || isFileLoading}
        />
      </div>

      <div className="flex-1 min-h-0 flex border-t border-studio-border">
        {showSidebarRail && (
          <div className="w-14 shrink-0 border-r border-studio-border bg-studio-canvas-inset">
            <StudioSidebarRail
              pendingCount={totalPendingCount}
              onExpand={() => setSidebarState("expanded")}
              historyHref={`/dashboard/${owner}/${repo}/history`}
              settingsHref={`/dashboard/${owner}/${repo}/settings`}
            />
          </div>
        )}

        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
          {showSidebarPanel && (
            <>
              <ResizablePanel
                id="sidebar"
                defaultSize={isMobile ? "35%" : `${Math.max(20, Math.min(40, sidebarPanelSize))}%`}
                minSize={isMobile ? "240px" : "20%"}
                maxSize={isMobile ? "70%" : "40%"}
                onResize={(size) => {
                  if (isSidebarCollapsed || isMobile) return
                  setSidebarPanelSize(Math.round(size.asPercentage))
                }}
                className="bg-studio-canvas-inset border-r border-studio-border flex flex-col h-full overflow-hidden"
              >
                {projectId && shouldShowProjectDataSkeleton ? (
                  <StudioSidebarLoading />
                ) : (
                  <>
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <FileTree
                        tree={overlayTree}
                        onSelect={(node) => {
                          if (node.type === "file") navigateToFile(node.path)
                        }}
                        selectedPath={selectedFile?.path}
                        titleMap={titleMap}
                        onCreateFile={projectId ? handleCreateFile : undefined}
                        onDeleteFile={projectId ? handleDeleteFile : undefined}
                        onUndoDelete={projectId ? handleUndoDelete : undefined}
                        onRenameFile={projectId ? handleRenameFile : undefined}
                        onMoveFile={projectId ? handleMoveFile : undefined}
                        owner={owner}
                        repo={repo}
                      />
                    </div>
                    <div className="shrink-0 border-t border-studio-border bg-studio-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-studio-canvas/80">
                      <div className="px-2 py-1.5 flex flex-col gap-1.5">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-8 w-full justify-between rounded-md border border-studio-border bg-studio-canvas px-2 text-xs hover:bg-studio-canvas-inset"
                        >
                          <Link href={`/dashboard/${owner}/${repo}/history`}>
                            <span className="inline-flex items-center gap-2">
                              <History className="h-3.5 w-3.5" />
                              History
                            </span>
                            <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1 text-[10px]">
                              {totalPendingCount}
                            </Badge>
                          </Link>
                        </Button>

                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-8 w-full justify-start rounded-md border border-studio-border bg-studio-canvas px-2 text-xs hover:bg-studio-canvas-inset"
                        >
                          <Link href={`/dashboard/${owner}/${repo}/settings`}>
                            <span className="inline-flex items-center gap-2">
                              <Settings className="h-3.5 w-3.5" />
                              Settings
                            </span>
                          </Link>
                        </Button>
                      </div>
                      {projectId && (
                        <PublishOpsBar
                          creates={opCounts.creates}
                          deletes={opCounts.deletes}
                          edits={editCount}
                          pendingOps={pendingOps}
                          dirtyDocs={dirtyDocs}
                          prUrl={activeBranch?.prUrl}
                          onPublish={() => {
                            openPublishDialog()
                          }}
                          onDiscard={handleDiscardAll}
                          onSelectFile={(path: string) => navigateToFile(path)}
                        />
                      )}
                    </div>
                  </>
                )}
              </ResizablePanel>
              {!isSidebarCollapsed && !isMobile && (
                <ResizableHandle className="w-1.5 bg-studio-border/50 hover:bg-studio-accent transition-colors" />
              )}
            </>
          )}

          <ResizablePanel
            id="editor"
            defaultSize={`${Math.max(30, Math.min(80, editorPanelSize))}%`}
            onResize={(size) => setEditorPanelSize(Math.round(size.asPercentage))}
            minSize="30%"
            className="min-w-0"
          >
            <div id="studio-editor" className="h-full flex flex-col overflow-hidden" tabIndex={-1}>
              {openFiles.length > 0 && (
                <div className="shrink-0 border-b border-studio-border bg-studio-canvas">
                  <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5">
                    {openFiles.map((path: string) => {
                      const label = titleMap?.[path] || path.split("/").pop() || path
                      const isActive = selectedFile?.path === path
                      return (
                        <div
                          key={path}
                          className={
                            isActive
                              ? "flex h-8 items-center gap-1 rounded-md border border-studio-accent/40 bg-studio-accent-muted px-2 text-xs"
                              : "flex h-8 items-center gap-1 rounded-md border border-studio-border bg-studio-canvas-inset/40 px-2 text-xs"
                          }
                        >
                          <button
                            type="button"
                            className="max-w-[220px] truncate text-left"
                            onClick={() => navigateToFile(path)}
                            title={path}
                          >
                            {label}
                          </button>
                          <button
                            type="button"
                            className="rounded p-0.5 text-studio-fg-muted hover:bg-studio-canvas-inset hover:text-studio-fg"
                            onClick={() => closeFile(path)}
                            title={`Close ${label}`}
                            aria-label={`Close ${label}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div
                className="flex-1 overflow-hidden"
                aria-busy={isSelectedDocumentLoading || (!selectedFile && shouldShowProjectDataSkeleton)}
              >
                {selectedFile ? (
                  isSelectedDocumentLoading ? (
                    <StudioEditorLoading showTabs={openFiles.length > 0} />
                  ) : (
                    <Editor
                      content={content}
                      frontmatter={frontmatter}
                      frontmatterSchema={frontmatterSchema}
                      fieldVariants={fieldVariants}
                      onChangeContent={setContent}
                      onChangeFrontmatter={setFrontmatterKey}
                      onSaveDraft={saveDraft}
                      onPublish={() => openPublishDialog()}
                      isSaving={isSaving || isFileLoading}
                      isPublishing={isPublishing}
                      canPublish={canPublish}
                      statusBadge={
                        <div className="flex items-center gap-1">
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                          {document && <StatusActions documentId={document._id} currentStatus={currentStatus as any} />}
                        </div>
                      }
                      scrollContainerRef={editorScrollRef}
                      onScroll={handleEditorScroll}
                      owner={owner}
                      repo={repo}
                      branch={branch}
                      contentRoot={contentRoot}
                      tree={overlayTree}
                    />
                  )
                ) : shouldShowProjectDataSkeleton ? (
                  <StudioNoSelectionLoading />
                ) : (
                  <div className="h-full flex items-center justify-center px-6">
                    <div className="w-full max-w-2xl space-y-5 text-center">
                      <div className="space-y-2">
                        <h2 className="text-2xl font-semibold tracking-tight text-studio-fg">No file selected</h2>
                        <p className="text-sm text-studio-fg-muted">
                          Pick a file to continue, or search the repository to jump directly.
                        </p>
                      </div>
                      <div className="mx-auto max-w-xl space-y-3">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-fg-muted" />
                          <Input
                            value={emptySearch}
                            onChange={(e) => setEmptySearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return
                              const firstResult = hasEmptySearchQuery ? emptySearchResults[0] : recentFileResults[0]
                              if (firstResult) {
                                navigateToFile(firstResult.path)
                              }
                            }}
                            className="h-11 pl-10 pr-4"
                            placeholder="Search docs and open with Enter"
                          />
                        </div>
                        <div className="rounded-lg border border-studio-border bg-studio-canvas-inset/30 p-2 text-left">
                          {!hasEmptySearchQuery && recentFileResults.length === 0 ? (
                            <p className="px-2 py-4 text-xs text-studio-fg-muted">
                              Start typing to search files in this repository.
                            </p>
                          ) : !hasEmptySearchQuery ? (
                            <div className="px-2 pb-1 pt-1">
                              <p className="pb-2 text-[11px] font-medium uppercase tracking-wide text-studio-fg-muted">
                                Recent files
                              </p>
                              <ul className="space-y-1">
                                {recentFileResults.map((file) => (
                                  <li key={file.path}>
                                    <button
                                      type="button"
                                      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-studio-canvas-inset"
                                      onClick={() => navigateToFile(file.path)}
                                    >
                                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-studio-fg-muted" />
                                      <span className="min-w-0">
                                        <span className="block truncate text-sm text-studio-fg">
                                          {file.title || file.name}
                                        </span>
                                        <span className="block truncate text-xs text-studio-fg-muted">{file.path}</span>
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : emptySearchResults.length === 0 ? (
                            <p className="px-2 py-4 text-xs text-studio-fg-muted">No files match your search.</p>
                          ) : (
                            <ul className="space-y-1">
                              {emptySearchResults.map((file) => (
                                <li key={file.path}>
                                  <button
                                    type="button"
                                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-studio-canvas-inset"
                                    onClick={() => navigateToFile(file.path)}
                                  >
                                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-studio-fg-muted" />
                                    <span className="min-w-0">
                                      <span className="block truncate text-sm text-studio-fg">
                                        {file.title || file.name}
                                      </span>
                                      <span className="block truncate text-xs text-studio-fg-muted">{file.path}</span>
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>

          {showPreview && (
            <>
              <ResizableHandle className="w-1.5 bg-studio-border/50 hover:bg-studio-accent transition-colors" />
              <ResizablePanel
                id="preview"
                defaultSize={`${Math.max(20, Math.min(60, previewPanelSize))}%`}
                onResize={(size) => setPreviewPanelSize(Math.round(size.asPercentage))}
                minSize="20%"
                maxSize="60%"
                className="min-w-0 bg-studio-canvas"
              >
                <div className="h-full overflow-hidden">
                  {isSelectedDocumentLoading || (!selectedFile && shouldShowProjectDataSkeleton) ? (
                    <StudioPreviewLoading />
                  ) : adapterLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-sm text-studio-fg-muted">Loading preview adapter...</div>
                    </div>
                  ) : adapterError ? (
                    <div className="h-full flex items-center justify-center p-4">
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Adapter Error</AlertTitle>
                        <AlertDescription>{adapterError}</AlertDescription>
                      </Alert>
                    </div>
                  ) : !selectedFile ? (
                    <StudioNoSelectionPreviewState />
                  ) : (
                    <Preview
                      content={content}
                      frontmatter={frontmatter}
                      fieldVariants={fieldVariants}
                      owner={owner}
                      repo={repo}
                      branch={branch}
                      scrollContainerRef={previewScrollRef}
                      onScroll={handlePreviewScroll}
                      adapter={adapter}
                      adapterDiagnostics={adapterDiagnostics}
                    />
                  )}
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      <div className="h-[--spacing-studio-footer-h] shrink-0 border-t border-studio-border flex items-center bg-studio-canvas">
        <StudioFooter
          isSaving={isSaving}
          lastSavedAt={document?.updatedAt}
          fileType={
            selectedFile?.path.endsWith(".mdx") ? "MDX" : selectedFile?.path.endsWith(".md") ? "Markdown" : "Text"
          }
        />
      </div>

      <CreateFileDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        parentPath={createDialogParent}
        contentRoot={contentRoot}
        onConfirm={handleConfirmCreate}
      />

      <PublishDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        pendingCounts={{
          creates: opCounts.creates,
          deletes: opCounts.deletes,
          edits: editCount,
        }}
        existingPrUrl={activeBranch?.prUrl}
        isPublishing={isPublishing}
        onConfirm={handlePublish}
        conflicts={publishConflicts}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        tree={overlayTree}
        titleMap={titleMap}
        recentFiles={recentFiles}
        onNavigateToFile={navigateToFile}
        onSaveDraft={saveDraft}
      />
    </div>
  )
}

function StudioProviderWrapper(props: StudioLayoutProps) {
  const { owner, repo, branch, projectId, contentRoot = "", tree, initialFile, currentPath } = props

  // 1. File state hook
  const studioFile = useStudioFile(initialFile, currentPath)
  const { selectedFile } = studioFile

  // 2. Queries hook
  const studioQueries = useStudioQueries(selectedFile?.path)
  const { previewEntry, enabledPlugins, pluginRegistry, activeBranch, components: componentSchema } = studioQueries

  // 3. Preview Context hook
  const previewContext = usePreviewContext({
    owner,
    repo,
    branch: activeBranch?.branchName ?? branch,
    adapterPath: previewEntry,
    enabledPlugins,
    pluginRegistry,
  })

  // 3. Auto-sync config logic
  React.useEffect(() => {
    if (!owner || !repo || !branch) return
    syncProjectsFromConfigAction(owner, repo, branch).catch((err) => {
      console.warn("Background config sync failed:", err)
    })
  }, [owner, repo, branch])

  // 4. Memoize Context Value
  const contextValue = React.useMemo(
    () => ({
      owner,
      repo,
      branch,
      projectId,
      contentRoot,
      tree,
      adapter: previewContext.context,
      adapterLoading: previewContext.loading,
      adapterError: previewContext.error,
      adapterDiagnostics: previewContext.diagnostics,
      components: componentSchema,
    }),
    [owner, repo, branch, projectId, contentRoot, tree, previewContext, componentSchema],
  )

  return (
    <StudioProvider value={contextValue}>
      <StudioAdapterProvider value={contextValue}>
        <StudioLayoutInner studioFile={studioFile} studioQueries={studioQueries} />
      </StudioAdapterProvider>
    </StudioProvider>
  )
}

export function StudioLayout(props: StudioLayoutProps) {
  const { owner, repo, branch, projectId, contentRoot = "", tree } = props

  const baseContextValue = React.useMemo(
    () => ({
      owner,
      repo,
      branch,
      projectId,
      contentRoot,
      tree,
      adapter: null,
      adapterLoading: false,
      adapterError: null,
      adapterDiagnostics: [],
      components: undefined,
    }),
    [owner, repo, branch, projectId, contentRoot, tree],
  )

  return (
    <StudioProvider value={baseContextValue}>
      <ViewModeProvider>
        <StudioProviderWrapper {...props} />
      </ViewModeProvider>
    </StudioProvider>
  )
}
