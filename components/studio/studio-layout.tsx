"use client"

import { useAction, useMutation, useQuery } from "convex/react"
import matter from "gray-matter"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getFrameworkConfig, normalizeFrontmatterDates } from "@/lib/framework-adapters"
import type { FieldVariantMap } from "@/lib/framework-adapters"
import type { FileTreeNode } from "@/lib/github"
import { DocumentList } from "./document-list"
import { Editor } from "./editor"
import { FileTree } from "./file-tree"
import { Preview } from "./preview"
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
  githubToken?: string
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
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

export function StudioLayout({ tree, initialFile, owner, repo, branch, currentPath, projectId, githubToken }: StudioLayoutProps) {
  const router = useRouter()
  const [selectedFile, setSelectedFile] = React.useState<FileTreeNode | null>(null)
  const [content, setContent] = React.useState("")
  const [frontmatter, setFrontmatter] = React.useState<Record<string, any>>({})
  const [sha, setSha] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isPublishing, setIsPublishing] = React.useState(false)

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
  const syncTreeTitles = useAction(api.documents.syncTreeTitles)

  const getOrCreateDocument = useMutation(api.documents.getOrCreate)
  const saveDraft = useMutation(api.documents.saveDraft)
  const publishDoc = useMutation(api.documents.publish)

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

  // Trigger background sync of file tree titles on first mount
  const hasSynced = React.useRef(false)
  React.useEffect(() => {
    if (hasSynced.current || !projectId || !githubToken || tree.length === 0) return
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
      syncTreeTitles({
        projectId: projectId as Id<"projects">,
        owner,
        repo,
        branch,
        files,
        githubToken,
      }).catch((err) => {
        console.error("Failed to sync tree titles:", err)
      })
    }
  }, [projectId, githubToken, tree, owner, repo, branch, syncTreeTitles])

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

  // Publish — saves draft, commits to GitHub, then transitions status via state machine
  const handlePublish = async () => {
    if (!selectedFile || !userId) return
    setIsPublishing(true)

    try {
      const docId = await ensureDocumentRecord()
      if (!docId) throw new Error("Could not create document record")

      // Save draft first so Convex has the latest content (creates history entry)
      await saveDraft({
        id: docId,
        body: content,
        frontmatter,
        editedBy: userId,
        message: "Pre-publish save",
      })

      // Reconstruct file content and commit to GitHub
      const fileContent = matter.stringify(content, frontmatter)
      const response = await fetch("/api/github/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          path: selectedFile.path,
          content: fileContent,
          sha,
          branch,
        }),
      })

      if (!response.ok) throw new Error("Failed to save to GitHub")

      const data = await response.json()
      const commitSha = data.commit?.sha || data.content?.sha || ""
      setSha(data.content?.sha || sha)

      // Transition to published (enforces state machine: must be draft or approved)
      await publishDoc({
        id: docId,
        commitSha,
        editedBy: userId,
      })

      toast.success("Published to GitHub")
    } catch (error: any) {
      console.error("Error publishing:", error)
      toast.error(error.message || "Failed to publish")
    } finally {
      setIsPublishing(false)
    }
  }

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
      <div className="w-64 shrink-0 border-r bg-muted/30 overflow-hidden flex flex-col">
        {projectId ? (
          <Tabs defaultValue="files" className="h-full flex flex-col">
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
              <FileTree tree={tree} onSelect={handleSelectFile} selectedPath={selectedFile?.path} titleMap={titleMap} />
            </TabsContent>
            <TabsContent value="documents" className="flex-1 m-0 overflow-hidden">
              <DocumentList
                projectId={projectId}
                selectedFilePath={selectedFile?.path}
                onSelectDocument={handleSelectDocument}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <FileTree tree={tree} onSelect={handleSelectFile} selectedPath={selectedFile?.path} titleMap={titleMap} />
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
              onPublish={handlePublish}
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
    </div>
  )
}
