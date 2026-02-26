"use client"

import { useMutation, useQuery } from "convex/react"
import matter from "gray-matter"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { countPendingOps, overlayOpsOnTree } from "@/lib/explorer-tree-overlay"
import type { ExplorerOp } from "@/lib/explorer-tree-overlay"
import { getFrameworkConfig, normalizeFrontmatterDates } from "@/lib/framework-adapters"
import type { FieldVariantMap } from "@/lib/framework-adapters"
import type { FileTreeNode } from "@/lib/github"
import { CreateFileDialog } from "./create-file-dialog"
import { DocumentList } from "./document-list"
import { Editor } from "./editor"
import { FileTree } from "./file-tree"
import { Preview } from "./preview"
import { PublishDialog } from "./publish-dialog"
import { PublishOpsBar } from "./publish-ops-bar"
import { StatusActions } from "./status-actions"

interface StudioLayoutProps {
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

/** Find a node in the tree by path */
function findNode(nodes: FileTreeNode[], path: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return null
}

export function StudioLayout({
  tree,
  initialFile,
  owner,
  repo,
  branch,
  currentPath,
  projectId,
  contentRoot = "",
}: StudioLayoutProps) {
  const router = useRouter()
  const [selectedFile, setSelectedFile] = React.useState<FileTreeNode | null>(null)
  const [content, setContent] = React.useState("")
  const [frontmatter, setFrontmatter] = React.useState<Record<string, any>>({})
  const [sha, setSha] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isPublishing, setIsPublishing] = React.useState(false)

  // Create file dialog state
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createDialogParent, setCreateDialogParent] = React.useState("")

  // Publish dialog state
  const [publishDialogOpen, setPublishDialogOpen] = React.useState(false)
  const [publishConflicts, setPublishConflicts] = React.useState<{ path: string; reason: string }[]>([])

  // Convex queries/mutations
  const user = useQuery(api.auth.getCurrentUser)
  const userId = user?._id as string | undefined
  const project = useQuery(api.projects.get, projectId ? { id: projectId as Id<"projects"> } : "skip")
  const document = useQuery(
    api.documents.getByFilePath,
    projectId && selectedFile?.type === "file"
      ? { projectId: projectId as Id<"projects">, filePath: selectedFile.path }
      : "skip",
  )

  // File tree title data
  const titleEntries = useQuery(
    api.documents.listTitlesForProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  )

  // Explorer ops & publish branches
  const pendingOps = useQuery(
    api.explorerOps.listPending,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  )
  const activeBranch = useQuery(
    api.publishBranches.getActiveForProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  )
  const dirtyDocs = useQuery(
    api.documents.listDirtyForProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  )

  const getOrCreateDocument = useMutation(api.documents.getOrCreate)
  const saveDraft = useMutation(api.documents.saveDraft)
  const stageCreate = useMutation(api.explorerOps.stageCreate)
  const stageDelete = useMutation(api.explorerOps.stageDelete)
  const undoOp = useMutation(api.explorerOps.undoOp)

  // Handle new files that exist in Convex but not yet on GitHub
  React.useEffect(() => {
    if (!initialFile && currentPath) {
      const name = currentPath.split("/").pop() || currentPath
      setSelectedFile({
        name,
        path: currentPath,
        sha: "",
        type: "file",
      })
    }
  }, [initialFile, currentPath])

  // Initialize state from initialFile (GitHub content)
  React.useEffect(() => {
    if (initialFile) {
      try {
        const { data, content: fileContent } = matter(initialFile.content)
        setFrontmatter(normalizeFrontmatterDates(data))
        setContent(fileContent)
        setSha(initialFile.sha)
        // Find the node in the tree, or create a minimal one
        const treeNode = findNode(tree, initialFile.path) || {
          name: initialFile.path.split("/").pop() || "",
          path: initialFile.path,
          sha: initialFile.sha,
          type: "file" as const,
        }
        setSelectedFile(treeNode)
      } catch (e) {
        console.error("Error parsing frontmatter:", e)
        setContent(initialFile.content)
        setFrontmatter({})
      }
    }
  }, [initialFile, tree])

  // After Convex document loads, hydrate editor from the latest saved draft (if any).
  // Track the file path we last hydrated for so we re-hydrate when the user switches files.
  const hydratedForPath = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!document || hydratedForPath.current === selectedFile?.path) return

    // Only hydrate from Convex for draft-like statuses; published content is authoritative from GitHub
    const draftStatuses = ["draft", "in_review", "approved"]
    if (!draftStatuses.includes(document.status)) {
      hydratedForPath.current = selectedFile?.path ?? null
      return
    }

    try {
      if (typeof document.body === "string" && document.body.length > 0) {
        setContent(document.body)
      }
      if (document.frontmatter && typeof document.frontmatter === "object") {
        setFrontmatter(normalizeFrontmatterDates(document.frontmatter))
      }

      hydratedForPath.current = selectedFile?.path ?? null
    } catch (e) {
      console.error("Error hydrating from Convex document draft:", e)
    }
  }, [document, selectedFile?.path])

  // Build title map for the file tree sidebar
  const titleMap = React.useMemo(() => {
    if (!titleEntries) return {}
    const map: Record<string, string> = {}
    for (const entry of titleEntries) {
      map[entry.filePath] = entry.title
    }
    return map
  }, [titleEntries])

  // Trigger background sync of file tree titles via server-side API (no token in client)
  const hasSynced = React.useRef(false)
  React.useEffect(() => {
    if (hasSynced.current || !projectId || tree.length === 0) return
    hasSynced.current = true

    // Flatten tree to get all file paths + shas
    const files: { path: string; sha: string }[] = []
    function collectFiles(nodes: FileTreeNode[]) {
      for (const node of nodes) {
        if (node.type === "file") {
          files.push({ path: node.path, sha: node.sha })
        } else if (node.children) {
          collectFiles(node.children)
        }
      }
    }
    collectFiles(tree)

    if (files.length > 0) {
      fetch("/api/github/sync-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, owner, repo, branch, files }),
      }).catch((err) => {
        console.error("Failed to sync tree titles:", err)
      })
    }
  }, [projectId, tree, owner, repo, branch])

  // Compute overlay tree with pending explorer ops
  const overlayTree = React.useMemo(() => {
    if (!pendingOps || pendingOps.length === 0) return tree
    const ops: ExplorerOp[] = pendingOps.map((op) => ({
      opType: op.opType,
      filePath: op.filePath,
      status: op.status,
    }))
    return overlayOpsOnTree(tree, ops, contentRoot)
  }, [tree, pendingOps, contentRoot])

  // Pending change counts for publish bar
  const opCounts = React.useMemo(() => {
    if (!pendingOps) return { creates: 0, deletes: 0 }
    const ops: ExplorerOp[] = pendingOps.map((op) => ({
      opType: op.opType,
      filePath: op.filePath,
      status: op.status,
    }))
    return countPendingOps(ops)
  }, [pendingOps])

  const editCount = dirtyDocs?.length ?? 0

  const navigateToFile = React.useCallback(
    (filePath: string) => {
      const studioBase = `/dashboard/${owner}/${repo}/studio`
      const params = new URLSearchParams()
      params.set("branch", branch)
      if (projectId) params.set("projectId", projectId)
      router.push(`${studioBase}/${filePath}?${params.toString()}`)
    },
    [owner, repo, branch, projectId, router],
  )

  const handleSelectFile = (node: FileTreeNode) => {
    if (node.type === "file") {
      navigateToFile(node.path)
    }
  }

  const handleSelectDocument = (filePath: string) => {
    navigateToFile(filePath)
  }

  // Ensure document record exists in Convex (atomic getOrCreate prevents duplicates)
  const ensureDocumentRecord = React.useCallback(async (): Promise<Id<"documents"> | null> => {
    if (!projectId || !selectedFile || selectedFile.type !== "file" || !userId) {
      return null
    }

    if (document) return document._id

    try {
      const docId = await getOrCreateDocument({
        projectId: projectId as Id<"projects">,
        filePath: selectedFile.path,
        title: frontmatter.title || selectedFile.name.replace(/\.(mdx?|markdown)$/i, ""),
        body: content,
        frontmatter,
        githubSha: sha || undefined,
      })
      return docId
    } catch (error) {
      console.error("Error creating document record:", error)
      return null
    }
  }, [projectId, selectedFile, userId, document, getOrCreateDocument, frontmatter, content, sha])

  // Save Draft — Convex only, no GitHub commit
  const handleSaveDraft = async () => {
    if (!selectedFile || !userId) {
      return
    }

    setIsSaving(true)

    try {
      const docId = await ensureDocumentRecord()
      if (!docId) throw new Error("Could not create document record")

      await saveDraft({
        id: docId,
        body: content,
        frontmatter,
        editedBy: userId,
        message: "Draft saved",
      })

      toast.success("Draft saved")
    } catch (error) {
      console.error("Error saving draft:", error)
      toast.error("Failed to save draft")
    } finally {
      setIsSaving(false)
    }
  }

  // Publish to PR — saves current draft first, then pushes all pending changes to a PR branch
  const handlePublish = async (title?: string, description?: string) => {
    if (!projectId || !userId) return
    setIsPublishing(true)
    setPublishConflicts([])

    try {
      // Save current file draft first if editing
      if (selectedFile && selectedFile.type === "file") {
        const docId = await ensureDocumentRecord()
        if (docId) {
          await saveDraft({
            id: docId,
            body: content,
            frontmatter,
            editedBy: userId,
            message: "Pre-publish save",
          })
        }
      }

      // Call the unified publish endpoint
      const response = await fetch("/api/github/publish-ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title, description }),
      })

      const data = await response.json()

      if (response.status === 409 && data.conflicts) {
        setPublishConflicts(data.conflicts)
        toast.error("Conflicts detected — resolve before publishing")
        return
      }

      if (!response.ok) throw new Error(data.error || "Failed to publish")

      toast.success(data.prUrl ? "Pushed to PR" : "Published")
      setPublishDialogOpen(false)
    } catch (error: any) {
      console.error("Error publishing:", error)
      toast.error(error.message || "Failed to publish")
    } finally {
      setIsPublishing(false)
    }
  }

  // Explorer handlers
  const handleCreateFile = React.useCallback((parentPath: string) => {
    setCreateDialogParent(parentPath)
    setCreateDialogOpen(true)
  }, [])

  const handleConfirmCreate = React.useCallback(
    async (fileName: string, parentPath: string) => {
      if (!projectId || !userId) return
      // Check if parentPath is already prefixed with contentRoot
      // (tree nodes already include contentRoot in their paths)
      const isAlreadyPrefixed = contentRoot && (parentPath === contentRoot || parentPath.startsWith(contentRoot + "/"))
      // Build the file path - only add contentRoot prefix if not already present
      let filePath: string
      if (isAlreadyPrefixed) {
        // Path already has contentRoot, just append filename
        filePath = parentPath ? `${parentPath}/${fileName}` : fileName
      } else if (contentRoot) {
        // Path doesn't have contentRoot, add it
        filePath = parentPath ? `${contentRoot}/${parentPath}/${fileName}` : `${contentRoot}/${fileName}`
      } else {
        // No contentRoot
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
        // Navigate to the new file
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
                await undoOp({ id: opId, userId: userId! })
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

  const frontmatterSchema = project?.frontmatterSchema as any[] | undefined

  // Derive fieldVariants from the project's detected framework
  const fieldVariants: FieldVariantMap = React.useMemo(() => {
    if (!project?.detectedFramework) return {}
    const config = getFrameworkConfig(project.detectedFramework as string)
    return config.fieldVariants
  }, [project?.detectedFramework])

  // Scroll sync between editor and preview
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
      {/* Left sidebar: file tree + document list tabs */}
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
                  onSelect={handleSelectFile}
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
                  onSelectDocument={handleSelectDocument}
                />
              </TabsContent>
            </Tabs>
            <PublishOpsBar
              creates={opCounts.creates}
              deletes={opCounts.deletes}
              edits={editCount}
              prUrl={activeBranch?.prUrl}
              onPublish={() => {
                setPublishConflicts([])
                setPublishDialogOpen(true)
              }}
              onDiscard={handleDiscardAll}
            />
          </>
        ) : (
          <FileTree
            tree={overlayTree}
            onSelect={handleSelectFile}
            selectedPath={selectedFile?.path}
            titleMap={titleMap}
          />
        )}
      </div>

      {/* Main content: editor + preview split */}
      <div className="flex-1 min-w-0 flex">
        {/* Editor panel */}
        <div className="flex-1 min-w-0 border-r overflow-hidden">
          {selectedFile ? (
            <Editor
              content={content}
              frontmatter={frontmatter}
              frontmatterSchema={frontmatterSchema}
              fieldVariants={fieldVariants}
              onChangeContent={setContent}
              onChangeFrontmatter={(key, value) => setFrontmatter((prev) => ({ ...prev, [key]: value }))}
              onSaveDraft={handleSaveDraft}
              onPublish={() => {
                setPublishConflicts([])
                setPublishDialogOpen(true)
              }}
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

        {/* Preview panel */}
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

      {/* Create file dialog */}
      <CreateFileDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        parentPath={createDialogParent}
        contentRoot={contentRoot}
        onConfirm={handleConfirmCreate}
      />

      {/* Publish dialog */}
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
