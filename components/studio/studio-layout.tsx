"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { FileTreeNode } from "@/lib/github"

import { CreateFileDialog } from "./create-file-dialog"
import { DocumentList } from "./document-list"
import { Editor } from "./editor"
import { FileTree } from "./file-tree"
import { Preview } from "./preview"
import { PublishDialog } from "./publish-dialog"
import { PublishOpsBar } from "./publish-ops-bar"
import { StatusActions } from "./status-actions"

import { StudioProvider, useStudio } from "./studio-context"
import { useStudioQueries } from "./hooks/use-studio-queries"
import { useStudioFile } from "./hooks/use-studio-file"
import { useStudioSave } from "./hooks/use-studio-save"
import { useStudioPublish } from "./hooks/use-studio-publish"

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

function StudioLayoutInner({
  initialFile,
  currentPath,
}: {
  initialFile?: StudioLayoutProps["initialFile"]
  currentPath: string
}) {
  const { projectId, contentRoot, owner, repo, branch } = useStudio()

  // 1. File state
  const {
    selectedFile,
    content,
    frontmatter,
    sha,
    navigateToFile,
    setContent,
    setFrontmatterKey,
    hydrateFromDocument,
  } = useStudioFile(initialFile, currentPath)

  // 2. Queries
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
  } = useStudioQueries(selectedFile?.path)

  // Hydrate file content from document draft if applicable
  const hydratedForPath = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!document || hydratedForPath.current === selectedFile?.path) return
    const draftStatuses = ["draft", "in_review", "approved"]
    if (draftStatuses.includes(document.status)) {
      hydrateFromDocument(document)
      hydratedForPath.current = selectedFile?.path ?? null
    } else {
      hydratedForPath.current = selectedFile?.path ?? null
    }
  }, [document, selectedFile?.path, hydrateFromDocument])

  // 3. Save
  const { isSaving, saveDraft, ensureDocumentRecord } = useStudioSave({
    userId,
    documentId: document?._id,
    selectedFile,
    content,
    frontmatter,
    sha,
  })

  // 4. Publish
  const {
    isPublishing,
    publishDialogOpen,
    publishConflicts,
    setPublishDialogOpen,
    handlePublish,
  } = useStudioPublish({
    userId,
    ensureDocumentRecord,
    selectedFile,
    content,
    frontmatter,
  })

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createDialogParent, setCreateDialogParent] = React.useState("")

  // Explorer mutations
  const stageCreate = useMutation(api.explorerOps.stageCreate)
  const stageDelete = useMutation(api.explorerOps.stageDelete)
  const undoOp = useMutation(api.explorerOps.undoOp)

  // Explorer handlers
  const handleCreateFile = React.useCallback((parentPath: string) => {
    setCreateDialogParent(parentPath)
    setCreateDialogOpen(true)
  }, [])

  const handleConfirmCreate = React.useCallback(
    async (fileName: string, parentPath: string) => {
      if (!projectId || !userId) return
      const isAlreadyPrefixed = contentRoot && (parentPath === contentRoot || parentPath.startsWith(contentRoot + "/"))
      let filePath: string
      if (isAlreadyPrefixed) {
        filePath = parentPath ? `${parentPath}/${fileName}` : fileName
      } else if (contentRoot) {
        filePath = parentPath ? `${contentRoot}/${parentPath}/${fileName}` : `${contentRoot}/${fileName}`
      } else {
        filePath = parentPath ? `${parentPath}/${fileName}` : fileName
      }
      try {
        await stageCreate({
          projectId: projectId as Id<"projects">,
          userId,
          filePath,
          title: fileName.replace(/\.(mdx?|markdown)$/i, ""),
          initialBody: "",
          initialFrontmatter: {
             title: fileName.replace(/\.(mdx?|markdown)$/i, ""),
          },
        })
        toast.success(`Created ${fileName}`)
        navigateToFile(filePath)
      } catch (error: any) {
        console.error("Error creating file:", error)
        toast.error(error.message || "Failed to create file")
      }
    },
    [projectId, userId, contentRoot, stageCreate, navigateToFile],
  )

  const handleDeleteFile = React.useCallback(
    async (filePath: string, fileSha: string) => {
      if (!projectId || !userId) return
      try {
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
    [projectId, userId, stageDelete, undoOp],
  )

  const handleUndoDelete = React.useCallback(
    async (filePath: string) => {
      if (!projectId || !userId || !pendingOps) return
      const op = pendingOps.find((o) => o.filePath === filePath && o.opType === "delete" && o.status === "pending")
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

  const currentStatus = document?.status || "draft"
  const statusInfo = STATUS_LABELS[currentStatus] || STATUS_LABELS.draft
  const canPublish = ["draft", "approved"].includes(currentStatus)

  // Scroll sync
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

  return (
    <div className="h-full w-full border-t flex overflow-hidden">
      <div className="w-64 shrink-0 border-r bg-muted/30 flex flex-col h-full min-h-0 overflow-hidden">
        {projectId ? (
          <>
            <Tabs defaultValue="files" className="flex-1 min-h-0 flex flex-col">
              <TabsList className="w-full shrink-0 rounded-none border-b h-9 bg-transparent p-0">
                <TabsTrigger
                  value="files"
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent h-9 text-xs"
                >
                  Files
                </TabsTrigger>
                <TabsTrigger
                  value="documents"
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent h-9 text-xs"
                >
                  Documents
                </TabsTrigger>
              </TabsList>
              <TabsContent value="files" className="flex-1 m-0 overflow-hidden">
                <FileTree
                  tree={overlayTree}
                  onSelect={(node) => {
                    if (node.type === "file") navigateToFile(node.path)
                  }}
                  selectedPath={selectedFile?.path}
                  titleMap={titleMap}
                  onCreateFile={handleCreateFile}
                  onDeleteFile={handleDeleteFile}
                  onUndoDelete={handleUndoDelete}
                />
              </TabsContent>
              <TabsContent value="documents" className="flex-1 m-0 overflow-hidden">
                <DocumentList
                  projectId={projectId}
                  selectedFilePath={selectedFile?.path}
                  onSelectDocument={navigateToFile}
                />
              </TabsContent>
            </Tabs>
            <PublishOpsBar
              creates={opCounts.creates}
              deletes={opCounts.deletes}
              edits={editCount}
              prUrl={activeBranch?.prUrl}
              onPublish={() => {
                setPublishDialogOpen(true)
              }}
              onDiscard={handleDiscardAll}
            />
          </>
        ) : (
          <FileTree
            tree={overlayTree}
            onSelect={(node) => {
              if (node.type === "file") navigateToFile(node.path)
            }}
            selectedPath={selectedFile?.path}
            titleMap={titleMap}
          />
        )}
      </div>

      <div className="flex-1 min-w-0 flex">
        <div className="flex-1 min-w-0 border-r overflow-hidden">
          {selectedFile ? (
            <Editor
              content={content}
              frontmatter={frontmatter}
              frontmatterSchema={frontmatterSchema}
              fieldVariants={fieldVariants}
              onChangeContent={setContent}
              onChangeFrontmatter={setFrontmatterKey}
              onSaveDraft={saveDraft}
              onPublish={() => setPublishDialogOpen(true)}
              isSaving={isSaving}
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
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">Select a file to edit</div>
          )}
        </div>

        <div className="flex-1 min-w-0 overflow-hidden">
          <Preview
            content={content}
            frontmatter={frontmatter}
            fieldVariants={fieldVariants}
            owner={owner}
            repo={repo}
            branch={branch}
            scrollContainerRef={previewScrollRef}
            onScroll={handlePreviewScroll}
          />
        </div>
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
    </div>
  )
}

export function StudioLayout(props: StudioLayoutProps) {
  const { owner, repo, branch, projectId, contentRoot = "", tree, initialFile, currentPath } = props

  const contextValue = React.useMemo(
    () => ({
      owner,
      repo,
      branch,
      projectId,
      contentRoot,
      tree,
    }),
    [owner, repo, branch, projectId, contentRoot, tree]
  )

  return (
    <StudioProvider value={contextValue}>
      <StudioLayoutInner initialFile={initialFile} currentPath={currentPath} />
    </StudioProvider>
  )
}
