"use client"

import * as React from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { FileTree } from "./file-tree"
import { DocumentList } from "./document-list"
import { Editor } from "./editor"
import { Preview } from "./preview"
import { StatusActions } from "./status-actions"
import type { GitHubFile } from "@/lib/github"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import matter from "gray-matter"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface StudioLayoutProps {
  files: GitHubFile[]
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
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  in_review: { label: "In Review", variant: "outline" },
  approved: { label: "Approved", variant: "outline" },
  published: { label: "Published", variant: "default" },
  scheduled: { label: "Scheduled", variant: "secondary" },
  archived: { label: "Archived", variant: "destructive" },
}

export function StudioLayout({ files, initialFile, owner, repo, branch, currentPath, projectId }: StudioLayoutProps) {
  const router = useRouter()
  const [selectedFile, setSelectedFile] = React.useState<GitHubFile | null>(null)
  const [content, setContent] = React.useState("")
  const [frontmatter, setFrontmatter] = React.useState<Record<string, any>>({})
  const [sha, setSha] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isPublishing, setIsPublishing] = React.useState(false)

  // Convex queries/mutations
  const user = useQuery(api.auth.getCurrentUser)
  // Better Auth returns Id<"user"> (singular) but mutations expect Id<"users"> (plural)
  const userId = user?._id as unknown as Id<"users"> | undefined
  const project = useQuery(
    api.projects.get,
    projectId ? { id: projectId as Id<"projects"> } : "skip",
  )
  const document = useQuery(
    api.documents.getByFilePath,
    projectId && selectedFile?.type === "file"
      ? { projectId: projectId as Id<"projects">, filePath: selectedFile.path }
      : "skip",
  )

  const getOrCreateDocument = useMutation(api.documents.getOrCreate)
  const saveDraft = useMutation(api.documents.saveDraft)
  const publishDoc = useMutation(api.documents.publish)

  // Initialize state from initialFile
  React.useEffect(() => {
    if (initialFile) {
      try {
        const { data, content: fileContent } = matter(initialFile.content)
        setFrontmatter(data)
        setContent(fileContent)
        setSha(initialFile.sha)
        const fileObj = files.find((f) => f.path === initialFile.path) || {
          name: initialFile.path.split("/").pop() || "",
          path: initialFile.path,
          sha: initialFile.sha,
          type: "file" as const,
          download_url: null,
        }
        setSelectedFile(fileObj)
      } catch (e) {
        console.error("Error parsing frontmatter:", e)
        setContent(initialFile.content)
        setFrontmatter({})
      }
    }
  }, [initialFile, files])

  const navigateToFile = React.useCallback((filePath: string) => {
    const studioBase = `/dashboard/${owner}/${repo}/studio`
    const params = new URLSearchParams()
    params.set("branch", branch)
    router.push(`${studioBase}/${filePath}?${params.toString()}`)
  }, [owner, repo, branch, router])

  const handleSelectFile = (file: GitHubFile) => {
    navigateToFile(file.path)
  }

  const handleSelectDocument = (filePath: string) => {
    navigateToFile(filePath)
  }

  // Ensure document record exists in Convex (atomic getOrCreate prevents duplicates)
  const ensureDocumentRecord = React.useCallback(async (): Promise<Id<"documents"> | null> => {
    if (!projectId || !selectedFile || selectedFile.type !== "file" || !userId) return null

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
    if (!selectedFile || !userId) return
    setIsSaving(true)

    try {
      const docId = await ensureDocumentRecord()
      if (!docId) throw new Error("Could not create document record")

      await saveDraft({
        id: docId,
        body: content,
        frontmatter,
        editedBy: userId!,
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
        editedBy: userId!,
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
        editedBy: userId!,
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

  return (
    <div className="h-[calc(100vh-4rem)] w-full border-t">
      <ResizablePanelGroup orientation="horizontal">
        {/* Left sidebar: file tree + document list tabs */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          {projectId ? (
            <Tabs defaultValue="files" className="h-full flex flex-col">
              <TabsList className="w-full rounded-none border-b h-9 bg-transparent p-0">
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
                  files={files}
                  onSelect={handleSelectFile}
                  selectedPath={selectedFile?.path}
                  currentPath={currentPath}
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
          ) : (
            <FileTree
              files={files}
              onSelect={handleSelectFile}
              selectedPath={selectedFile?.path}
              currentPath={currentPath}
            />
          )}
        </ResizablePanel>

        <ResizableHandle />

        {/* Editor panel */}
        <ResizablePanel defaultSize={40} minSize={30}>
          {selectedFile ? (
            <Editor
              content={content}
              frontmatter={frontmatter}
              frontmatterSchema={frontmatterSchema}
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
                  {document && (
                    <StatusActions
                      documentId={document._id}
                      currentStatus={currentStatus as any}
                    />
                  )}
                </div>
              }
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">Select a file to edit</div>
          )}
        </ResizablePanel>

        <ResizableHandle />

        {/* Preview panel */}
        <ResizablePanel defaultSize={40} minSize={30}>
          <Preview content={content} frontmatter={frontmatter} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
