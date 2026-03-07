"use client"

import { useMutation } from "convex/react"
import * as React from "react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FileTreeNode } from "@/lib/github"
import { useStudio } from "../studio-context"

interface UseStudioPublishProps {
  userId?: string | null
  documentUpdatedAt?: number | null
  ensureDocumentRecord: () => Promise<Id<"documents"> | null>
  selectedFile: FileTreeNode | null
  content: string
  frontmatter: Record<string, any>
}

export function useStudioPublish({
  userId,
  documentUpdatedAt,
  ensureDocumentRecord,
  selectedFile,
  content,
  frontmatter,
}: UseStudioPublishProps) {
  const { projectId } = useStudio()

  const [isPublishing, setIsPublishing] = React.useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = React.useState(false)
  const [publishConflicts, setPublishConflicts] = React.useState<{ path: string; reason: string }[]>([])

  const saveDraftMutation = useMutation(api.documents.saveDraft)

  const handlePublish = React.useCallback(
    async (title?: string, description?: string) => {
      if (!projectId) return
      setIsPublishing(true)
      setPublishConflicts([])

      try {
        // Save current file draft first if editing
        if (selectedFile && selectedFile.type === "file") {
          const docId = await ensureDocumentRecord()
          if (docId) {
            await saveDraftMutation({
              id: docId,
              expectedUpdatedAt: documentUpdatedAt ?? undefined,
              body: content,
              frontmatter,
              message: "Pre-publish save",
              userId: userId ?? undefined,
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
    },
    [projectId, userId, documentUpdatedAt, selectedFile, ensureDocumentRecord, saveDraftMutation, content, frontmatter],
  )

  const openPublishDialog = React.useCallback(() => {
    setPublishConflicts([])
    setPublishDialogOpen(true)
  }, [])

  return {
    isPublishing,
    publishDialogOpen,
    publishConflicts,
    openPublishDialog,
    setPublishDialogOpen,
    handlePublish,
  }
}
