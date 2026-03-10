"use client"

import { useMutation } from "convex/react"
import * as React from "react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FileTreeNode } from "@/lib/github"
import { useStudio } from "../studio-context"

interface UseStudioSaveProps {
  userId?: string | null
  projectAccessToken?: string | null
  documentId?: string | null
  documentUpdatedAt?: number | null
  selectedFile: FileTreeNode | null
  content: string
  frontmatter: Record<string, any>
  sha: string | null
}

export function useStudioSave({
  userId,
  projectAccessToken,
  documentId,
  documentUpdatedAt,
  selectedFile,
  content,
  frontmatter,
  sha,
}: UseStudioSaveProps) {
  const { projectId } = useStudio()
  const [isSaving, setIsSaving] = React.useState(false)

  const getOrCreateDocument = useMutation(api.documents.getOrCreate)
  const saveDraftMutation = useMutation(api.documents.saveDraft)

  // Refs for rapidly-changing values to avoid re-creating callbacks
  const contentRef = React.useRef(content)
  const frontmatterRef = React.useRef(frontmatter)
  const shaRef = React.useRef(sha)
  const updatedAtRef = React.useRef(documentUpdatedAt)
  contentRef.current = content
  frontmatterRef.current = frontmatter
  shaRef.current = sha
  updatedAtRef.current = documentUpdatedAt

  const ensureDocumentRecord = React.useCallback(async (): Promise<Id<"documents"> | null> => {
    if (!projectId || !selectedFile || selectedFile.type !== "file" || (!userId && !projectAccessToken)) {
      return null
    }

    if (documentId) return documentId as Id<"documents">

    try {
      const docId = await getOrCreateDocument({
        projectId: projectId as Id<"projects">,
        filePath: selectedFile.path,
        title: frontmatterRef.current.title || selectedFile.name.replace(/\.(mdx?|markdown)$/i, ""),
        body: contentRef.current,
        frontmatter: frontmatterRef.current,
        githubSha: shaRef.current || undefined,
        userId: userId ?? undefined,
        projectAccessToken: projectAccessToken ?? undefined,
      })
      return docId
    } catch (error) {
      console.error("Error creating document record:", error)
      return null
    }
  }, [projectId, selectedFile, userId, projectAccessToken, documentId, getOrCreateDocument])

  const saveDraft = React.useCallback(async () => {
    if (!selectedFile) {
      return
    }

    setIsSaving(true)

    try {
      const docId = await ensureDocumentRecord()
      if (!docId) throw new Error("Could not create document record")

      await saveDraftMutation({
        id: docId,
        expectedUpdatedAt: updatedAtRef.current ?? undefined,
        body: contentRef.current,
        frontmatter: frontmatterRef.current,
        message: "Draft saved",
        userId: userId ?? undefined,
        projectAccessToken: projectAccessToken ?? undefined,
      })

      toast.success("Draft saved")
    } catch (error) {
      console.error("Error saving draft:", error)
      toast.error("Failed to save draft")
    } finally {
      setIsSaving(false)
    }
  }, [selectedFile, ensureDocumentRecord, saveDraftMutation, userId, projectAccessToken])

  return {
    isSaving,
    saveDraft,
    ensureDocumentRecord, // Exported so publish can use it
  }
}
