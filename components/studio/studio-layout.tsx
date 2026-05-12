"use client"

import { useMutation } from "convex/react"
import { AlertCircle, Command, FileText, FolderOpen, History, Loader2, Search, Settings, X } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"
import { syncProjectsFromConfigAction } from "@/app/dashboard/[owner]/[repo]/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { DOCUMENT_STATUS_CONFIG, type DocumentStatus, isPublishableDocumentStatus } from "@/lib/document-status"
import { getFrameworkAdapter } from "@/lib/framework-adapters"
import { type FileTreeNode, findTreeNode } from "@/lib/github"
import { usePreviewContext } from "@/lib/hooks/use-preview-context"
import { parseContentFile } from "@/lib/repopress/content-file"
import { buildHistoryHref } from "@/lib/studio/history-link"
import { getPublishLaneViewModel } from "@/lib/studio/publish-lane-view-model"
import { cn } from "@/lib/utils"
import { CommandPalette } from "./command-palette"
import { getDiscardPlan } from "./discard-pending-changes"
import { Editor } from "./editor"
import { FileTree } from "./file-tree"
import { usePrStatusSync } from "./hooks/use-pr-status-sync"
import { useStudioFile } from "./hooks/use-studio-file"
import { useStudioPublish } from "./hooks/use-studio-publish"
import { useStudioQueries } from "./hooks/use-studio-queries"
import { useStudioSave } from "./hooks/use-studio-save"
import { getPendingChangeSummary, hasDiscardableChanges } from "./pending-change-summary"
import { Preview } from "./preview"
import { PublishDialog } from "./publish-dialog"
import { PublishOpsBar } from "./publish-ops-bar"
import {
  buildScrollAnchors,
  calculateSyncedScrollTop,
  createScrollSyncCoordinator,
  type ScrollSyncAnchor,
} from "./scroll-sync"
import { SmartCreateFileDialog } from "./smart-create-file-dialog"
import { StatusActions } from "./status-actions"
import { StudioAdapterProvider } from "./studio-adapter-context"
import { StudioProvider, useStudio } from "./studio-context"
import { StudioFooter } from "./studio-footer"
import { StudioHeader } from "./studio-header"
import { useViewMode, ViewModeProvider } from "./view-mode-context"

// ── Insert Component Modal Context ──────────────────────────────────────
// Bridges studio-layout (keyboard shortcut) → insert-jsx-button (modal)
// without prop-drilling through editor.tsx / studio-toolbar.tsx.

type InsertComponentModalContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const InsertComponentModalContext = React.createContext<InsertComponentModalContextValue | null>(null)

export function useInsertComponentModal() {
  return React.useContext(InsertComponentModalContext)
}

// ─────────────────────────────────────────────────────────────────────────

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
  projectAccessToken?: string
  contentRoot?: string
  role?: "owner" | "editor" | "viewer"
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

function StudioPanelShell({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & { children: React.ReactNode }) {
  return (
    <div className={cn("h-full overflow-hidden rounded-lg bg-studio-canvas", className)} {...props}>
      {children}
    </div>
  )
}

function StudioSidebarLoading() {
  return (
    <div className="flex h-full flex-col bg-studio-canvas-inset/35">
      <div className="shrink-0 border-b border-studio-border px-3 py-3">
        <Skeleton className="h-3.5 w-20" />
      </div>

      <div className="shrink-0 border-b border-studio-border px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <Skeleton className="h-3.5 w-24" />
          <div className="flex items-center gap-1">
            <Skeleton className="h-6 w-6 rounded-md" />
            <Skeleton className="h-6 w-6 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-7 w-full rounded-md" />
      </div>

      <div className="flex-1 overflow-hidden px-3 py-3">
        <div className="space-y-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <div key={`sidebar-skeleton-${i}`} className="flex items-center gap-2 px-1 py-1">
              <Skeleton className="h-3.5 w-3.5 rounded" />
              <Skeleton className={i % 3 === 0 ? "h-3.5 w-40" : i % 3 === 1 ? "h-3.5 w-32" : "h-3.5 w-48"} />
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-studio-border p-3">
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
    <div className="flex h-full items-center justify-center px-6 py-8">
      <div className="w-full max-w-3xl space-y-6 text-center">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52 mx-auto" />
          <Skeleton className="h-4 w-96 mx-auto max-w-full" />
        </div>
        <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-studio-border/70 bg-studio-canvas-inset/30 p-4 shadow-sm">
          <div className="mx-auto max-w-xl space-y-3">
            <Skeleton className="h-11 w-full rounded-md" />
            <div className="space-y-1 rounded-lg border border-studio-border bg-studio-canvas-inset/30 p-2">
              {[1, 2].map((i) => (
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
    </div>
  )
}

function StudioPreviewLoading() {
  return (
    <div className="h-full flex flex-col bg-studio-canvas">
      <div className="shrink-0 border-b border-studio-border px-4 py-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-14" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-studio-canvas-inset/30">
        <div className="mx-auto max-w-[920px] p-5">
          <div className="rounded-[1.5rem] border border-studio-border/70 bg-studio-canvas p-7 shadow-sm">
            <div className="space-y-4">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-52 w-full rounded-[1.25rem]" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-10/12" />
              <Skeleton className="mt-6 h-8 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StudioNoSelectionPreviewState() {
  return (
    <div className="flex h-full flex-col bg-studio-canvas select-none">
      <div className="flex items-center justify-between border-b border-studio-border px-4 py-3 shrink-0">
        <span className="text-[10px] font-medium tracking-[0.18em] text-studio-fg-muted">Preview</span>
      </div>
      <div className="flex flex-1 items-center justify-center bg-studio-canvas-inset/30 px-6 py-8">
        <div className="flex flex-col items-center gap-4 text-center max-w-xs">
          <div className="flex size-12 items-center justify-center rounded-lg bg-studio-canvas-inset/60">
            <FileText className="size-6 text-studio-fg-muted" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-medium text-studio-fg">No file selected</h3>
            <p className="text-xs leading-5 text-studio-fg-muted">
              Open a Markdown or MDX file from the explorer to preview it here.
            </p>
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
      <div className="flex h-full flex-col bg-studio-canvas-inset/60">
        <div className="flex flex-col items-center gap-1 border-b border-studio-border px-2 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl text-studio-fg transition-colors hover:bg-studio-canvas-inset"
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

        <div className="flex flex-col items-center gap-2 border-t border-studio-border px-2 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 rounded-lg hover:bg-studio-canvas-inset"
                title="History"
                aria-label="Project history"
              >
                <Link href={historyHref}>
                  <History className="h-4 w-4" />
                  {pendingCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-studio-accent px-1 text-[9px] font-semibold text-studio-accent-fg">
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
                className="h-9 w-9 rounded-lg hover:bg-studio-canvas-inset"
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
  const {
    projectId,
    projectAccessToken,
    contentRoot,
    owner,
    repo,
    branch,
    adapter,
    adapterLoading,
    adapterError,
    adapterDiagnostics,
  } = useStudio()

  // Framework adapter for file naming / frontmatter - uses the project's detectedFramework string
  const frameworkAdapter = React.useMemo(() => {
    const fw = studioQueries.project?.detectedFramework as string | undefined
    return fw ? getFrameworkAdapter(fw) : null
  }, [studioQueries.project?.detectedFramework])
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
    closeFile,
    discardFileFromClientState,
    reloadFileFromRemote,
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
    pendingMediaOps,
    overlayTree,
    currentPublishLane,
    dirtyDocs,
    frontmatterSchema,
    fieldVariants,
  } = studioQueries

  // Build a set of full repo-relative paths for documents with pending edits.
  // doc.filePath is already the full tree path (set from selectedFile.path on save).
  const dirtyPaths = React.useMemo(() => {
    return new Set((dirtyDocs ?? []).map((doc: any) => doc.filePath))
  }, [dirtyDocs])

  const publishLaneViewModel = React.useMemo(
    () =>
      getPublishLaneViewModel({
        currentLane: currentPublishLane,
      }),
    [currentPublishLane],
  )

  const canMutateExplorer = Boolean(userId || projectAccessToken)

  const hydratedForPath = React.useRef<string | null>(null)

  React.useEffect(() => {
    const selectedPath = selectedFile?.path ?? null
    if (!selectedPath) {
      hydratedForPath.current = null
      return
    }
    if (!document || hydratedForPath.current === selectedPath) return

    const draftStatuses = new Set(["draft", "in_review", "approved"])
    if (draftStatuses.has(document.status)) {
      hydrateFromDocument(document)
    }
    hydratedForPath.current = selectedPath
  }, [document, selectedFile?.path, hydrateFromDocument])

  // Explorer mutations
  const stageCreate = useMutation(api.explorerOps.stageCreate)
  const stageDelete = useMutation(api.explorerOps.stageDelete)
  const undoOp = useMutation(api.explorerOps.undoOp)
  const discardAllPendingChanges = useMutation(api.explorerOps.discardAll)

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createDialogParent, setCreateDialogParent] = React.useState("")
  const [discardDialogOpen, setDiscardDialogOpen] = React.useState(false)
  const [isDiscarding, setIsDiscarding] = React.useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false)
  const [insertComponentModalOpen, setInsertComponentModalOpen] = React.useState(false)
  const [emptySearch, setEmptySearch] = React.useState("")
  const [isMobile, setIsMobile] = React.useState(false)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  // 3. Save logic
  const { isSaving, saveDraft, ensureDocumentRecord } = useStudioSave({
    userId,
    projectAccessToken,
    documentId: document?._id,
    documentUpdatedAt: document?.updatedAt,
    selectedFile,
    content,
    frontmatter,
    sha,
  })

  // 4. Publish logic
  const {
    isPublishing,
    publishDialogOpen,
    publishConflicts,
    publishMode,
    openPublishDialog,
    setPublishDialogOpen,
    setPublishMode,
    handlePublish,
  } = useStudioPublish({
    userId,
    projectAccessToken,
    documentUpdatedAt: document?.updatedAt,
    ensureDocumentRecord,
    selectedFile,
    content,
    frontmatter,
    defaultPublishMode: publishLaneViewModel.defaultMode,
  })

  // Explorer handlers
  const handleCreateFile = React.useCallback((parentPath: string) => {
    setCreateDialogParent(parentPath)
    setCreateDialogOpen(true)
  }, [])

  /** Children of the currently selected create-dialog parent folder (for conflict resolution) */
  const folderChildren = React.useMemo(() => {
    if (!createDialogParent) {
      // Root: top-level names in the overlay tree
      return overlayTree.map((n) => n.name)
    }
    // Find the folder node in the overlay tree
    const folderNode = findTreeNode(overlayTree, createDialogParent)
    return folderNode?.children?.map((n) => n.name) ?? []
  }, [overlayTree, createDialogParent])

  /** Full child nodes of the current create-dialog parent (for sibling frontmatter inference) */
  const folderChildNodes = React.useMemo(() => {
    if (!createDialogParent) return overlayTree
    const folderNode = findTreeNode(overlayTree, createDialogParent)
    return folderNode?.children ?? []
  }, [overlayTree, createDialogParent])

  const handleConfirmCreate = React.useCallback(
    async (fileName: string, parentPath: string, initialFrontmatter?: Record<string, unknown>) => {
      if (!projectId || !canMutateExplorer) return
      const isAlreadyPrefixed = contentRoot && (parentPath === contentRoot || parentPath.startsWith(`${contentRoot}/`))
      let filePath: string
      if (isAlreadyPrefixed) {
        filePath = parentPath ? `${parentPath}/${fileName}` : fileName
      } else if (contentRoot) {
        filePath = parentPath ? `${contentRoot}/${parentPath}/${fileName}` : `${contentRoot}/${fileName}`
      } else {
        filePath = parentPath ? `${parentPath}/${fileName}` : fileName
      }
      // For index-if-empty: the actual file is at filePath (e.g. slug/index.mdx)
      // but it may include a newly created subfolder - keep filePath as-is.
      try {
        const fm = initialFrontmatter ?? {}
        const title =
          typeof fm.title === "string" && fm.title.trim()
            ? fm.title.trim()
            : fileName.replace(/\.(mdx?|markdown)$/i, "")
        await stageCreate({
          projectId: projectId as Id<"projects">,
          userId,
          projectAccessToken,
          filePath,
          title,
          initialBody: "",
          initialFrontmatter: { title, ...fm },
        })
        primeFileSnapshot(filePath, {
          content: "",
          frontmatter: { title, ...fm },
          sha: null,
        })
        const displayName = fileName.split("/").pop() ?? fileName
        toast.success(`Created ${displayName}`)
        navigateToFile(filePath)
      } catch (error: any) {
        console.error("Error creating file:", error)
        toast.error(error.message || "Failed to create file")
      }
    },
    [
      projectId,
      canMutateExplorer,
      userId,
      projectAccessToken,
      contentRoot,
      stageCreate,
      primeFileSnapshot,
      navigateToFile,
    ],
  )

  const handleDeleteFile = React.useCallback(
    async (filePath: string, fileSha: string) => {
      if (!projectId || !canMutateExplorer) return
      try {
        const pendingCreateOp = pendingOps?.find(
          (op: any) => op.filePath === filePath && op.opType === "create" && op.status === "pending",
        )
        if (pendingCreateOp) {
          await undoOp({ id: pendingCreateOp._id, userId, projectAccessToken })
          discardFileFromClientState(filePath)
          toast.success("Removed staged new file")
          return
        }

        const opId = await stageDelete({
          projectId: projectId as Id<"projects">,
          userId,
          projectAccessToken,
          filePath,
          previousSha: fileSha || undefined,
        })
        toast("File staged for deletion", {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await undoOp({ id: opId, userId, projectAccessToken })
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
    [
      projectId,
      canMutateExplorer,
      userId,
      projectAccessToken,
      pendingOps,
      undoOp,
      discardFileFromClientState,
      stageDelete,
    ],
  )

  const handleUndoDelete = React.useCallback(
    async (filePath: string) => {
      if (!projectId || !canMutateExplorer || !pendingOps) return
      const op = pendingOps.find((o: any) => o.filePath === filePath && o.opType === "delete" && o.status === "pending")
      if (!op) return
      try {
        await undoOp({ id: op._id, userId, projectAccessToken })
        toast.success("Delete undone")
      } catch (error: any) {
        console.error("Error undoing delete:", error)
        toast.error(error.message || "Failed to undo")
      }
    },
    [projectId, canMutateExplorer, userId, projectAccessToken, pendingOps, undoOp],
  )

  const handleDiscardAll = React.useCallback(async () => {
    if (!projectId || !canMutateExplorer) return

    const plan = getDiscardPlan({
      pendingOps: (pendingOps ?? []).map((op: any) => ({
        _id: String(op._id),
        opType: op.opType,
        filePath: op.filePath,
        status: op.status,
      })),
      dirtyDocs: (dirtyDocs ?? []).map((doc: any) => ({
        _id: String(doc._id),
        filePath: doc.filePath,
      })),
      pendingMediaOps: (pendingMediaOps ?? []).map((op: any) => ({
        _id: String(op._id),
        repoPath: op.repoPath,
        status: op.status,
        sourceFilePath: op.sourceFilePath,
      })),
    })

    if (!hasDiscardableChanges(plan)) {
      toast.success("No pending changes to discard")
      return
    }

    const createdPaths = new Set(
      (pendingOps ?? [])
        .filter((op: any) => op.status === "pending" && op.opType === "create")
        .map((op: any) => op.filePath),
    )

    setIsDiscarding(true)
    try {
      await discardAllPendingChanges({
        projectId: projectId as Id<"projects">,
        userId,
        projectAccessToken,
      })

      for (const filePath of plan.filePathsToReset) {
        if (createdPaths.has(filePath)) {
          discardFileFromClientState(filePath)
        } else {
          reloadFileFromRemote(filePath)
        }
      }
      toast.success("All pending changes discarded")
    } catch (error: any) {
      toast.error(error.message || "Failed to discard changes")
    } finally {
      setIsDiscarding(false)
    }
  }, [
    projectId,
    pendingOps,
    dirtyDocs,
    pendingMediaOps,
    canMutateExplorer,
    userId,
    projectAccessToken,
    discardAllPendingChanges,
    discardFileFromClientState,
    reloadFileFromRemote,
  ])

  const resolveRelocatePayload = React.useCallback(
    async (oldPath: string) => {
      const selectedPath = selectedFile?.path
      if (selectedPath === oldPath) {
        const currentFrontmatter = (frontmatter || {}) as Record<string, unknown>
        const title =
          typeof currentFrontmatter.title === "string" && currentFrontmatter.title.trim().length > 0
            ? currentFrontmatter.title
            : inferTitleFromPath(oldPath)

        return {
          body: content,
          frontmatter: currentFrontmatter,
          title,
          previousSha: sha || undefined,
          isFromPendingCreate: false,
          pendingCreateOpId: undefined as Id<"explorerOps"> | undefined,
        }
      }

      const pendingCreateOp = pendingOps?.find(
        (op: any) => op.filePath === oldPath && op.opType === "create" && op.status === "pending",
      )
      if (pendingCreateOp) {
        const pendingFrontmatter = (pendingCreateOp.initialFrontmatter || {}) as Record<string, unknown>
        const title =
          typeof pendingFrontmatter.title === "string" && pendingFrontmatter.title.trim().length > 0
            ? pendingFrontmatter.title
            : inferTitleFromPath(oldPath)

        return {
          body: pendingCreateOp.initialBody || "",
          frontmatter: pendingFrontmatter,
          title,
          previousSha: undefined,
          isFromPendingCreate: true,
          pendingCreateOpId: pendingCreateOp._id as Id<"explorerOps">,
        }
      }

      const params = new URLSearchParams({
        owner,
        repo,
        path: oldPath,
        branch,
      })
      const response = await fetch(`/api/github/file?${params.toString()}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || `Failed to load file content (${response.status})`)
      }

      const payload = (await response.json()) as {
        content: string
        sha: string
      }
      const parsed = parseContentFile(payload.content || "", oldPath)
      const parsedFrontmatter = parsed.frontmatter
      const title =
        typeof parsedFrontmatter.title === "string" && parsedFrontmatter.title.trim().length > 0
          ? parsedFrontmatter.title
          : inferTitleFromPath(oldPath)

      return {
        body: parsed.body || "",
        frontmatter: parsedFrontmatter,
        title,
        previousSha: payload.sha || undefined,
        isFromPendingCreate: false,
        pendingCreateOpId: undefined as Id<"explorerOps"> | undefined,
      }
    },
    [selectedFile?.path, frontmatter, content, sha, pendingOps, owner, repo, branch],
  )

  const stageRelocateFile = React.useCallback(
    async (oldPath: string, newPath: string, actionLabel: "renamed" | "moved") => {
      if (!projectId || !canMutateExplorer) return
      if (!oldPath || !newPath || oldPath === newPath) return

      const oldNode = findTreeNodeByPath(overlayTree, oldPath)
      const oldName = oldPath.split("/").pop() || oldPath
      const newName = newPath.split("/").pop() || newPath

      try {
        const payload = await resolveRelocatePayload(oldPath)
        const createOpId = await stageCreate({
          projectId: projectId as Id<"projects">,
          userId,
          projectAccessToken,
          filePath: newPath,
          title: payload.title || inferTitleFromPath(newPath),
          initialBody: payload.body,
          initialFrontmatter: payload.frontmatter,
        })

        if (payload.isFromPendingCreate && payload.pendingCreateOpId) {
          try {
            await undoOp({
              id: payload.pendingCreateOpId,
              userId,
              projectAccessToken,
            })
          } catch (error) {
            await undoOp({ id: createOpId, userId, projectAccessToken }).catch(() => {})
            throw error
          }
        } else {
          let deleteOpId: Id<"explorerOps">
          try {
            deleteOpId = await stageDelete({
              projectId: projectId as Id<"projects">,
              userId,
              projectAccessToken,
              filePath: oldPath,
              previousSha: oldNode?.sha || payload.previousSha,
            })
          } catch (error) {
            await undoOp({ id: createOpId, userId, projectAccessToken }).catch(() => {})
            throw error
          }

          toast(`File staged for ${actionLabel}`, {
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  await undoOp({ id: deleteOpId, userId, projectAccessToken })
                  await undoOp({ id: createOpId, userId, projectAccessToken })
                  toast.success(`${actionLabel === "renamed" ? "Rename" : "Move"} undone`)
                } catch {
                  toast.error("Failed to undo file operation")
                }
              },
            },
          })
        }

        primeFileSnapshot(newPath, {
          content: payload.body,
          frontmatter: payload.frontmatter,
          sha: null,
        })

        if (selectedFile?.path === oldPath) {
          navigateToFile(newPath)
        }

        toast.success(`${oldName} ${actionLabel} to ${newName}`)
      } catch (error: any) {
        console.error(`Error ${actionLabel} file:`, error)
        toast.error(error.message || `Failed to ${actionLabel} file`)
      }
    },
    [
      projectId,
      canMutateExplorer,
      userId,
      projectAccessToken,
      overlayTree,
      resolveRelocatePayload,
      stageCreate,
      stageDelete,
      undoOp,
      selectedFile?.path,
      primeFileSnapshot,
      navigateToFile,
    ],
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
  const lastScrollSource = React.useRef<"editor" | "preview">("editor")
  const scrollSyncSettleTimer = React.useRef<number | null>(null)

  // Scroll anchor cache - keyed by container, invalidated when scrollHeight or width changes
  const headingsCache = React.useRef<
    Map<HTMLDivElement, { scrollHeight: number; clientWidth: number; anchors: ScrollSyncAnchor[] }>
  >(new Map())

  // Preserve scroll position when switching between editor and preview modes
  const savedEditorScrollRatio = React.useRef(0)
  const savedPreviewScrollRatio = React.useRef(0)

  // Capture scroll position before switching modes
  const captureScrollPositions = React.useCallback(() => {
    if (editorScrollRef.current) {
      const maxScroll = editorScrollRef.current.scrollHeight - editorScrollRef.current.clientHeight
      savedEditorScrollRatio.current = maxScroll > 0 ? editorScrollRef.current.scrollTop / maxScroll : 0
    }
    if (previewScrollRef.current) {
      const maxScroll = previewScrollRef.current.scrollHeight - previewScrollRef.current.clientHeight
      savedPreviewScrollRatio.current = maxScroll > 0 ? previewScrollRef.current.scrollTop / maxScroll : 0
    }
  }, [])

  // Restore scroll position after mode switch completes
  React.useLayoutEffect(() => {
    // Double requestAnimationFrame: first frame commits layout, second applies after
    // MDX async compilation finishes updating scrollHeight.
    const restoreScroll = () => {
      if (editorScrollRef.current) {
        const maxScroll = editorScrollRef.current.scrollHeight - editorScrollRef.current.clientHeight
        editorScrollRef.current.scrollTop = savedEditorScrollRatio.current * maxScroll
      }
      if (previewScrollRef.current) {
        const maxScroll = previewScrollRef.current.scrollHeight - previewScrollRef.current.clientHeight
        previewScrollRef.current.scrollTop = savedPreviewScrollRatio.current * maxScroll
      }
    }

    // Defer restoration to ensure layout and async MDX rendering are complete
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(restoreScroll)
    })
    return () => cancelAnimationFrame(raf1)
  }, [])

  const getScrollSyncMetrics = React.useCallback(
    (container: HTMLDivElement) => {
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
      const root = container.querySelector<HTMLElement>("[data-scroll-sync-root]")

      if (!root) {
        return { start: 0, scrollable: maxScroll, maxScroll, anchors: [] as ScrollSyncAnchor[] }
      }

      const containerRect = container.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      const start = Math.max(0, rootRect.top - containerRect.top + container.scrollTop)
      // Clamp end to maxScroll to avoid a small unmapped bottom gap when
      // root.scrollHeight slightly underestimates due to padding/margin.
      const end = Math.min(maxScroll, Math.max(start, start + root.scrollHeight - container.clientHeight))

      // Collect scroll anchors - cached by scrollHeight + clientWidth so we
      // re-measure on content changes and panel resizes.
      let anchors: ScrollSyncAnchor[]
      const cached = headingsCache.current.get(container)
      if (cached && cached.scrollHeight === container.scrollHeight && cached.clientWidth === container.clientWidth) {
        anchors = cached.anchors
      } else {
        anchors = buildScrollAnchors(root, container, start)
        headingsCache.current.set(container, {
          scrollHeight: container.scrollHeight,
          clientWidth: container.clientWidth,
          anchors,
        })
      }

      return {
        start,
        scrollable: Math.max(0, end - start),
        maxScroll,
        anchors,
      }
    },
    // headingsCache is a ref - stable reference, no dep needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const syncScroll = React.useCallback(
    (source: "editor" | "preview") => {
      const sourceEl = source === "editor" ? editorScrollRef.current : previewScrollRef.current
      const targetEl = source === "editor" ? previewScrollRef.current : editorScrollRef.current

      if (sourceEl && targetEl) {
        const sourceMetrics = getScrollSyncMetrics(sourceEl)
        const targetMetrics = getScrollSyncMetrics(targetEl)
        const desiredTargetTop = calculateSyncedScrollTop(sourceEl.scrollTop, sourceMetrics, targetMetrics)

        const clampedTargetTop = Math.min(targetMetrics.maxScroll, Math.max(0, desiredTargetTop))

        if (Math.abs(targetEl.scrollTop - clampedTargetTop) > 1) {
          targetEl.scrollTop = clampedTargetTop
        }
      }
    },
    [getScrollSyncMetrics],
  )

  const scrollSyncCoordinator = React.useMemo(() => createScrollSyncCoordinator(syncScroll), [syncScroll])

  const scheduleScrollSyncSettle = React.useCallback(
    (source: "editor" | "preview" = lastScrollSource.current) => {
      lastScrollSource.current = source

      if (scrollSyncSettleTimer.current !== null) {
        window.clearTimeout(scrollSyncSettleTimer.current)
      }

      scrollSyncSettleTimer.current = window.setTimeout(() => {
        scrollSyncSettleTimer.current = null
        headingsCache.current.clear()
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollSyncCoordinator.schedule(lastScrollSource.current)
          })
        })
      }, 300)
    },
    [scrollSyncCoordinator],
  )

  React.useEffect(() => {
    return () => {
      if (scrollSyncSettleTimer.current !== null) {
        window.clearTimeout(scrollSyncSettleTimer.current)
      }
      scrollSyncCoordinator.clear()
    }
  }, [scrollSyncCoordinator])

  const handlePreviewCompilingChange = React.useCallback(
    (isCompiling: boolean) => {
      if (isCompiling) {
        if (scrollSyncSettleTimer.current !== null) {
          window.clearTimeout(scrollSyncSettleTimer.current)
          scrollSyncSettleTimer.current = null
        }
        return
      }

      scheduleScrollSyncSettle()
    },
    [scheduleScrollSyncSettle],
  )

  const handleEditorScroll = React.useCallback(() => {
    lastScrollSource.current = "editor"
    scrollSyncCoordinator.schedule("editor")
  }, [scrollSyncCoordinator])

  const handlePreviewScroll = React.useCallback(() => {
    lastScrollSource.current = "preview"
    scrollSyncCoordinator.schedule("preview")
  }, [scrollSyncCoordinator])

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isEditableTarget =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        setInsertComponentModalOpen(true)
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      if (e.key === "/" && !isEditableTarget) {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if (e.key === "Escape" && commandPaletteOpen) {
        e.preventDefault()
        setCommandPaletteOpen(false)
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault()
        captureScrollPositions()
        setViewMode("editor")
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        saveDraft()
        return
      }

      if (isEditableTarget) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault()
        setSidebarState(sidebarState === "expanded" ? "collapsed" : "expanded")
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault()
        captureScrollPositions()
        setViewMode(viewMode === "split" ? "editor" : "split")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [sidebarState, viewMode, setSidebarState, setViewMode, saveDraft, commandPaletteOpen, captureScrollPositions])

  const isSidebarCollapsed = !isMobile && sidebarState === "collapsed"
  const showPreview = viewMode === "split" && !isMobile
  const [resolvedProjectDataId, setResolvedProjectDataId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!projectId) {
      setResolvedProjectDataId("none")
      return
    }
    if (pendingOps !== undefined && dirtyDocs !== undefined && pendingMediaOps !== undefined) {
      setResolvedProjectDataId(projectId)
    }
  }, [projectId, pendingOps, dirtyDocs, pendingMediaOps])

  const isProjectDataLoading =
    Boolean(projectId) && (pendingOps === undefined || dirtyDocs === undefined || pendingMediaOps === undefined)
  const shouldShowProjectDataSkeleton =
    Boolean(projectId) && resolvedProjectDataId !== projectId && isProjectDataLoading
  const isSelectedDocumentLoading = isFileLoading

  const pendingSummary = React.useMemo(
    () =>
      getPendingChangeSummary({
        pendingOps: (pendingOps ?? []).map((op: any) => ({
          _id: String(op._id),
          opType: op.opType,
          filePath: op.filePath,
          status: op.status,
        })),
        dirtyDocs: (dirtyDocs ?? []).map((doc: any) => ({
          _id: String(doc._id),
          filePath: doc.filePath,
        })),
        pendingMediaOps: (pendingMediaOps ?? []).map((op: any) => ({
          _id: String(op._id),
          repoPath: op.repoPath,
          status: op.status,
          sourceFilePath: op.sourceFilePath,
        })),
      }),
    [pendingOps, dirtyDocs, pendingMediaOps],
  )
  const totalPendingCount = pendingSummary.total
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
      if (results.length >= 2) break
    }
    return results
  }, [recentFiles, flatFilesByPath])

  const showSidebarPanel = isMobile ? sidebarState === "expanded" : !isSidebarCollapsed
  const showSidebarRail = !isMobile && isSidebarCollapsed

  const currentStatus: DocumentStatus = (document?.status as DocumentStatus | undefined) ?? "draft"
  const statusInfo = DOCUMENT_STATUS_CONFIG[currentStatus] || DOCUMENT_STATUS_CONFIG.draft
  const canPublish = isPublishableDocumentStatus(currentStatus)
  const historyHref = buildHistoryHref({ owner, repo, branch, projectId })

  const insertComponentModalCtx = React.useMemo(
    () => ({ open: insertComponentModalOpen, setOpen: setInsertComponentModalOpen }),
    [insertComponentModalOpen],
  )

  return (
    <InsertComponentModalContext.Provider value={insertComponentModalCtx}>
      <div
        className="h-full w-full flex flex-col overflow-hidden bg-studio-canvas text-studio-fg"
        role="application"
        aria-label="RepoPress Studio"
      >
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {document ? `Editing ${selectedFile?.name || "file"}, status: ${currentStatus}` : "No file selected"}
        </div>
        <div className="h-[--spacing-studio-header-h] shrink-0 border-b border-studio-border flex items-center px-3 sm:px-4 z-10 bg-studio-canvas">
          <StudioHeader
            selectedFile={selectedFile}
            contentRoot={contentRoot}
            documentId={document?._id}
            currentStatus={currentStatus}
            statusInfo={statusInfo}
            onSave={saveDraft}
            isSaving={isSaving || isFileLoading}
          />
        </div>

        <div className="flex flex-1 min-h-0 gap-3 px-3 py-3">
          {showSidebarRail && (
            <div className="w-16 shrink-0">
              <StudioPanelShell className="bg-studio-canvas-inset/70">
                <StudioSidebarRail
                  pendingCount={totalPendingCount}
                  onExpand={() => setSidebarState("expanded")}
                  historyHref={historyHref}
                  settingsHref={`/dashboard/${owner}/${repo}/settings`}
                />
              </StudioPanelShell>
            </div>
          )}

          <ResizablePanelGroup
            orientation="horizontal"
            className="flex-1 min-h-0"
            onLayoutChanged={() => scheduleScrollSyncSettle()}
          >
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
                  className="min-w-0"
                >
                  <StudioPanelShell className="flex flex-col bg-studio-canvas-inset/70">
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
                            adapter={frameworkAdapter}
                            dirtyPaths={dirtyPaths}
                          />
                        </div>
                        <div className="shrink-0 border-t border-studio-border bg-studio-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-studio-canvas/80">
                          <div className="flex flex-col gap-1.5 px-3 py-3">
                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="h-9 w-full justify-between rounded-xl border border-studio-border bg-studio-canvas px-3 text-xs hover:bg-studio-canvas-inset"
                            >
                              <Link href={historyHref}>
                                <span className="inline-flex items-center gap-2">
                                  <History className="h-3.5 w-3.5" />
                                  History
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="h-5 min-w-5 justify-center rounded-full px-1 text-[10px]"
                                >
                                  {totalPendingCount}
                                </Badge>
                              </Link>
                            </Button>

                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="h-9 w-full justify-start rounded-xl border border-studio-border bg-studio-canvas px-3 text-xs hover:bg-studio-canvas-inset"
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
                              creates={pendingSummary.creates}
                              deletes={pendingSummary.deletes}
                              edits={pendingSummary.edits}
                              media={pendingSummary.media}
                              pendingOps={pendingOps}
                              dirtyDocs={dirtyDocs}
                              pendingMediaOps={pendingMediaOps}
                              hasCurrentLane={Boolean(currentPublishLane)}
                              currentPrNumber={
                                publishLaneViewModel.currentLane?.prNumber ?? currentPublishLane?.prNumber
                              }
                              currentPrUrl={publishLaneViewModel.currentLane?.prUrl ?? currentPublishLane?.prUrl}
                              isDiscarding={isDiscarding}
                              onPublish={() => {
                                openPublishDialog()
                              }}
                              onDiscard={() => setDiscardDialogOpen(true)}
                              onSelectFile={(path: string) => navigateToFile(path)}
                            />
                          )}
                        </div>
                      </>
                    )}
                  </StudioPanelShell>
                </ResizablePanel>
                {!isSidebarCollapsed && !isMobile && (
                  <ResizableHandle className="relative mx-1 flex w-4 cursor-col-resize items-center justify-center bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-[3px] after:-translate-x-1/2 after:rounded-sm after:bg-studio-border/60 after:transition-colors hover:after:bg-studio-accent" />
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
              <StudioPanelShell id="studio-editor" className="flex h-full flex-col overflow-hidden" tabIndex={-1}>
                {openFiles.length > 0 && (
                  <div className="shrink-0 border-b border-studio-border bg-studio-canvas">
                    <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
                      <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-studio-fg-muted md:inline">
                        Open
                      </span>
                      {openFiles.map((path: string) => {
                        const label = titleMap?.[path] || path.split("/").pop() || path
                        const isActive = selectedFile?.path === path
                        return (
                          <div
                            key={path}
                            className={cn(
                              "group flex h-9 items-center gap-2 rounded-xl border px-2.5 text-xs shadow-sm transition-colors",
                              isActive
                                ? "border-studio-accent/30 bg-studio-accent-muted text-studio-fg"
                                : "border-studio-border/70 bg-studio-canvas-inset/40 text-studio-fg-muted hover:bg-studio-canvas-inset/70",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                dirtyPaths.has(path) ? "bg-studio-accent" : "bg-studio-border",
                              )}
                            />
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
                              className="rounded-md p-1 text-studio-fg-muted transition-colors hover:bg-studio-canvas hover:text-studio-fg"
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
                            {document && <StatusActions documentId={document._id} currentStatus={currentStatus} />}
                          </div>
                        }
                        scrollContainerRef={editorScrollRef}
                        onScroll={handleEditorScroll}
                        owner={owner}
                        repo={repo}
                        branch={branch}
                        projectId={projectId}
                        userId={userId}
                        filePath={selectedFile.path}
                        contentRoot={contentRoot}
                        tree={overlayTree}
                      />
                    )
                  ) : shouldShowProjectDataSkeleton ? (
                    <StudioNoSelectionLoading />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-studio-canvas-inset/20 px-6 py-8">
                      <div className="w-full max-w-xl rounded-xl bg-studio-canvas p-6 shadow-sm">
                        <div className="space-y-5">
                          <div className="space-y-3 text-left">
                            <div className="space-y-2">
                              <h2 className="text-2xl font-semibold tracking-tight text-studio-fg">
                                Open a file and keep the whole studio in flow
                              </h2>
                              <p className="max-w-xl text-sm leading-6 text-studio-fg-muted">
                                Search the repository, jump back into a recent draft, or use the explorer to start
                                editing.
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <button
                              type="button"
                              className="rounded-lg border border-studio-border/70 bg-studio-canvas-inset/35 p-4 text-left transition-colors hover:bg-studio-canvas-inset/60"
                              onClick={() => setCommandPaletteOpen(true)}
                            >
                              <div className="mb-3 flex size-10 items-center justify-center rounded-md border border-studio-border/70 bg-studio-canvas">
                                <Command className="h-4 w-4 text-studio-fg-muted" />
                              </div>
                              <p className="text-sm font-medium text-studio-fg">Command palette</p>
                              <p className="mt-1 text-xs leading-5 text-studio-fg-muted">
                                Press{" "}
                                <kbd className="rounded border border-studio-border bg-studio-canvas px-1.5 py-0.5 font-sans text-[10px]">
                                  ⌘K
                                </kbd>{" "}
                                to search files and actions.
                              </p>
                            </button>

                            <button
                              type="button"
                              className="rounded-lg border border-studio-border/70 bg-studio-canvas-inset/35 p-4 text-left transition-colors hover:bg-studio-canvas-inset/60"
                              onClick={() => searchInputRef.current?.focus()}
                            >
                              <div className="mb-3 flex size-10 items-center justify-center rounded-md border border-studio-border/70 bg-studio-canvas">
                                <Search className="h-4 w-4 text-studio-fg-muted" />
                              </div>
                              <p className="text-sm font-medium text-studio-fg">Jump to a document</p>
                              <p className="mt-1 text-xs leading-5 text-studio-fg-muted">
                                Search by path, filename, or frontmatter title below.
                              </p>
                            </button>
                          </div>

                          <div className="mx-auto max-w-xl space-y-3 lg:mx-0">
                            <div className="group relative">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-fg-muted" />
                              <Input
                                ref={searchInputRef}
                                id="studio-empty-search"
                                name="studio-empty-search"
                                value={emptySearch}
                                onChange={(e) => setEmptySearch(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key !== "Enter") return
                                  const firstResult = hasEmptySearchQuery ? emptySearchResults[0] : recentFileResults[0]
                                  if (firstResult) {
                                    navigateToFile(firstResult.path)
                                  }
                                }}
                                className="h-11 rounded-xl border-studio-border bg-studio-canvas pl-10 pr-10 shadow-sm"
                                placeholder="Search docs..."
                              />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                                {hasEmptySearchQuery ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEmptySearch("")
                                      searchInputRef.current?.focus()
                                    }}
                                    className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
                                    aria-label="Clear search"
                                  >
                                    <X className="h-4 w-4 text-studio-fg-muted" />
                                  </button>
                                ) : (
                                  <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-studio-border bg-studio-canvas-inset px-1.5 font-mono text-[10px] font-medium text-studio-fg-muted opacity-60 sm:flex">
                                    <span className="text-xs">/</span>
                                  </kbd>
                                )}
                              </div>
                            </div>
                            <div className="rounded-lg border border-studio-border bg-studio-canvas-inset/30 p-2 text-left">
                              {!hasEmptySearchQuery && recentFileResults.length === 0 ? (
                                <p className="px-2 py-4 text-xs text-studio-fg-muted">
                                  Start typing to search files in this repository.
                                </p>
                              ) : !hasEmptySearchQuery ? (
                                <div className="px-2 pb-1 pt-1">
                                  <p className="pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-studio-fg-muted">
                                    Recent files
                                  </p>
                                  <ul className="space-y-1">
                                    {recentFileResults.map((file) => (
                                      <li key={file.path}>
                                        <button
                                          type="button"
                                          className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-studio-canvas-inset"
                                          onClick={() => navigateToFile(file.path)}
                                        >
                                          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-studio-fg-muted" />
                                          <span className="min-w-0">
                                            <span className="block truncate text-sm text-studio-fg">
                                              {file.title || file.name}
                                            </span>
                                            <span className="block truncate text-xs text-studio-fg-muted">
                                              {file.path}
                                            </span>
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
                                        className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-studio-canvas-inset"
                                        onClick={() => navigateToFile(file.path)}
                                      >
                                        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-studio-fg-muted" />
                                        <span className="min-w-0">
                                          <span className="block truncate text-sm text-studio-fg">
                                            {file.title || file.name}
                                          </span>
                                          <span className="block truncate text-xs text-studio-fg-muted">
                                            {file.path}
                                          </span>
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
                    </div>
                  )}
                </div>
              </StudioPanelShell>
            </ResizablePanel>

            {showPreview && (
              <>
                <ResizableHandle className="relative mx-1 flex w-4 cursor-col-resize items-center justify-center bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-[3px] after:-translate-x-1/2 after:rounded-sm after:bg-studio-border/60 after:transition-colors hover:after:bg-studio-accent" />
                <ResizablePanel
                  id="preview"
                  defaultSize={`${Math.max(20, Math.min(60, previewPanelSize))}%`}
                  onResize={(size) => setPreviewPanelSize(Math.round(size.asPercentage))}
                  minSize="20%"
                  maxSize="60%"
                  className="min-w-0"
                >
                  <StudioPanelShell className="bg-studio-canvas">
                    {isSelectedDocumentLoading || (!selectedFile && shouldShowProjectDataSkeleton) ? (
                      <StudioPreviewLoading />
                    ) : adapterLoading && !adapter ? (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-sm text-studio-fg-muted">Loading preview runtime...</div>
                      </div>
                    ) : adapterError && !adapter ? (
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
                        projectId={projectId}
                        userId={userId}
                        filePath={selectedFile.path}
                        contentRoot={contentRoot}
                        scrollContainerRef={previewScrollRef}
                        onScroll={handlePreviewScroll}
                        onCompilingChange={handlePreviewCompilingChange}
                        adapter={adapter}
                        adapterDiagnostics={adapterDiagnostics}
                      />
                    )}
                  </StudioPanelShell>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>

        <div className="h-[--spacing-studio-footer-h] shrink-0 border-t border-studio-border flex items-center bg-studio-canvas px-2">
          <StudioFooter
            isSaving={isSaving}
            lastSavedAt={document?.updatedAt}
            fileType={
              selectedFile?.path.endsWith(".mdx")
                ? "MDX"
                : /\.(md|markdown)$/i.test(selectedFile?.path ?? "")
                  ? "Markdown"
                  : "Text"
            }
            filePath={selectedFile?.path}
            pendingChanges={totalPendingCount}
          />
        </div>

        <SmartCreateFileDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          parentPath={createDialogParent}
          contentRoot={contentRoot}
          adapter={frameworkAdapter}
          folderChildren={folderChildren}
          folderChildNodes={folderChildNodes}
          owner={owner}
          repo={repo}
          branch={branch}
          onConfirm={({ fileName, parentPath, frontmatter }) => handleConfirmCreate(fileName, parentPath, frontmatter)}
        />

        <PublishDialog
          open={publishDialogOpen}
          onOpenChange={setPublishDialogOpen}
          pendingCounts={{
            creates: pendingSummary.creates,
            deletes: pendingSummary.deletes,
            edits: pendingSummary.edits,
            media: pendingSummary.media,
          }}
          publishLaneViewModel={publishLaneViewModel}
          publishMode={publishMode}
          onPublishModeChange={setPublishMode}
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

        <AlertDialog
          open={discardDialogOpen}
          onOpenChange={(open) => {
            if (isDiscarding) return
            setDiscardDialogOpen(open)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard all pending changes?</AlertDialogTitle>
              <AlertDialogDescription>
                This will revert all your staged creations, deletions, and edits. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDiscarding}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={isDiscarding}
                onClick={async () => {
                  await handleDiscardAll()
                  setDiscardDialogOpen(false)
                }}
              >
                {isDiscarding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Discarding…
                  </>
                ) : (
                  "Discard Changes"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </InsertComponentModalContext.Provider>
  )
}

function StudioProviderWrapper(props: StudioLayoutProps) {
  const {
    owner,
    repo,
    branch,
    projectId,
    projectAccessToken,
    contentRoot = "",
    tree: initialTree,
    initialFile,
    currentPath,
    role = "owner",
  } = props

  // Tree starts from the server-provided value ([] when server deferred loading).
  // A client-side fetch runs immediately when the initial tree is empty, unblocking
  // the server render from the expensive GitHub recursive-tree API call.
  const [tree, setTree] = React.useState<FileTreeNode[]>(initialTree)
  React.useEffect(() => {
    if (initialTree.length > 0) return
    const qp = new URLSearchParams({ owner, repo, branch: branch ?? "main", contentRoot })
    fetch(`/api/github/tree?${qp}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: FileTreeNode[]) => setTree(data))
      .catch(() => {}) // non-critical: empty tree is an acceptable fallback
  }, [owner, repo, branch, contentRoot, initialTree.length])

  // 1. File state hook
  const studioFile = useStudioFile(initialFile, currentPath)
  const { selectedFile } = studioFile

  // 2. Queries hook - pass the local tree state so overlayTree uses the async-fetched
  // tree rather than the outer StudioProvider's empty initialTree.
  const studioQueries = useStudioQueries(selectedFile?.path, { tree })
  const {
    previewEntry,
    resolvedRuntime,
    enabledPlugins,
    pluginRegistry,
    currentPublishLane,
    userId,
    components: componentSchema,
  } = studioQueries

  // Verify the active publish lane's PR is still open on GitHub.
  // Corrects state drift when the closed/merged webhook was never delivered.
  usePrStatusSync({
    laneId: currentPublishLane?._id as any,
    prNumber: currentPublishLane?.prNumber,
    laneStatus: currentPublishLane?.status,
    owner,
    repo,
    userId: userId ?? undefined,
    projectAccessToken: projectAccessToken ?? undefined,
  })

  // 3. Preview Context hook
  const previewContext = usePreviewContext({
    owner,
    repo,
    branch: currentPublishLane?.branchName ?? branch,
    adapterPath: resolvedRuntime?.entryPath ?? previewEntry,
    adapterRoot: resolvedRuntime?.rootPath ?? null,
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
      projectAccessToken,
      userId,
      selectedFilePath: selectedFile?.path,
      contentRoot,
      tree,
      role,
      adapter: previewContext.context,
      adapterLoading: previewContext.loading,
      adapterError: previewContext.error,
      adapterDiagnostics: previewContext.diagnostics,
      components: componentSchema,
      // Resolve insert-picker components by precedence:
      //  1. Use contentRoot-scoped adapter components when the native runtime provides them.
      //  2. Otherwise use the full merged adapter context so repo-native components remain discoverable.
      //  3. The registry layer still gives project config schema precedence and falls back to framework defaults.
      resolvedComponents:
        contentRoot && previewContext.context?.componentsByContext?.[contentRoot]
          ? previewContext.context.componentsByContext[contentRoot]
          : previewContext.context
            ? previewContext.context.components
            : undefined,
      detectedFramework: studioQueries.project?.detectedFramework as string | undefined,
    }),
    [
      owner,
      repo,
      branch,
      projectId,
      projectAccessToken,
      userId,
      selectedFile?.path,
      contentRoot,
      tree,
      role,
      previewContext,
      componentSchema,
      studioQueries.project?.detectedFramework,
    ],
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
  const { owner, repo, branch, projectId, projectAccessToken, contentRoot = "", tree, role = "owner" } = props

  const baseContextValue = React.useMemo(
    () => ({
      owner,
      repo,
      branch,
      projectId,
      projectAccessToken,
      userId: undefined,
      selectedFilePath: undefined,
      contentRoot,
      tree,
      role,
      adapter: null,
      adapterLoading: false,
      adapterError: null,
      adapterDiagnostics: [],
      components: undefined,
      resolvedComponents: undefined,
    }),
    [owner, repo, branch, projectId, projectAccessToken, contentRoot, tree, role],
  )

  return (
    <StudioProvider value={baseContextValue}>
      <ViewModeProvider>
        <StudioProviderWrapper {...props} />
      </ViewModeProvider>
    </StudioProvider>
  )
}
