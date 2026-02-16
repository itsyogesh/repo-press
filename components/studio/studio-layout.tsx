"use client"

import * as React from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { FileTree } from "./file-tree"
import { Editor } from "./editor"
import { Preview } from "./preview"
import type { GitHubFile } from "@/lib/github"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import matter from "gray-matter"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

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
  approved: { label: "Approved", variant: "default" },
  published: { label: "Published", variant: "default" },
  scheduled: { label: "Scheduled", variant: "outline" },
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

  const createDocument = useMutation(api.documents.create)
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

  const handleSelectFile = (file: GitHubFile) => {
    const studioBase = `/dashboard/${owner}/${repo}/studio`
    const params = new URLSearchParams()
    params.set("branch", branch)
    if (projectId) params.set("projectId", projectId)
    router.push(`${studioBase}/${file.path}?${params.toString()}`)
  }

  // Ensure document record exists in Convex
  const ensureDocumentRecord = React.useCallback(async (): Promise<Id<"documents"> | null> => {
    if (!projectId || !selectedFile || selectedFile.type !== "file" || !user?._id) return null

    // Already exists
    if (document) return document._id

    // Create it
    try {
      const docId = await createDocument({
        projectId: projectId as Id<"projects">,
        filePath: selectedFile.path,
        title: frontmatter.title || selectedFile.name.replace(/\.(mdx?|markdown)$/i, ""),
        status: "draft",
        body: content,
        frontmatter,
        githubSha: sha || undefined,
      })
      return docId
    } catch (error) {
      console.error("Error creating document record:", error)
      return null
    }
  }, [projectId, selectedFile, user, document, createDocument, frontmatter, content, sha])

  // Save Draft — Convex only, no GitHub commit
  const handleSaveDraft = async () => {
    if (!selectedFile || !user?._id) return
    setIsSaving(true)

    try {
      const docId = await ensureDocumentRecord()
      if (!docId) throw new Error("Could not create document record")

      await saveDraft({
        id: docId,
        body: content,
        frontmatter,
        editedBy: user._id,
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

  // Publish — saves to GitHub, then records commit in Convex
  const handlePublish = async () => {
    if (!selectedFile || !user?._id) return
    setIsPublishing(true)

    try {
      const docId = await ensureDocumentRecord()
      if (!docId) throw new Error("Could not create document record")

      // Reconstruct file content and save to GitHub
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

      // Record the publish in Convex
      await publishDoc({
        id: docId,
        commitSha,
        editedBy: user._id,
      })

      toast.success("Published to GitHub")
    } catch (error) {
      console.error("Error publishing:", error)
      toast.error("Failed to publish")
    } finally {
      setIsPublishing(false)
    }
  }

  const currentStatus = document?.status || "draft"
  const statusInfo = STATUS_LABELS[currentStatus] || STATUS_LABELS.draft

  // Frontmatter schema from the project (or fall back to default fields)
  const frontmatterSchema = project?.frontmatterSchema as any[] | undefined

  return (
    <div className="h-[calc(100vh-4rem)] w-full border-t">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <FileTree
            files={files}
            onSelect={handleSelectFile}
            selectedPath={selectedFile?.path}
            currentPath={currentPath}
          />
        </ResizablePanel>

        <ResizableHandle />

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
              statusBadge={
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              }
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">Select a file to edit</div>
          )}
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={40} minSize={30}>
          <Preview content={content} frontmatter={frontmatter} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
