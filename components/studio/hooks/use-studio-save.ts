import * as React from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { toast } from "sonner"
import type { FileTreeNode } from "@/lib/github"
import { useStudio } from "../studio-context"

interface UseStudioSaveProps {
    userId?: string | null
    documentId?: string | null
    selectedFile: FileTreeNode | null
    content: string
    frontmatter: Record<string, any>
    sha: string | null
}

export function useStudioSave({
    userId,
    documentId,
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
    contentRef.current = content
    frontmatterRef.current = frontmatter
    shaRef.current = sha

    const ensureDocumentRecord = React.useCallback(async (): Promise<Id<"documents"> | null> => {
        if (!projectId || !selectedFile || selectedFile.type !== "file" || !userId) {
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
            })
            return docId
        } catch (error) {
            console.error("Error creating document record:", error)
            return null
        }
    }, [projectId, selectedFile, userId, documentId, getOrCreateDocument])

    const saveDraft = React.useCallback(async () => {
        if (!selectedFile || !userId) {
            return
        }

        setIsSaving(true)

        try {
            const docId = await ensureDocumentRecord()
            if (!docId) throw new Error("Could not create document record")

            await saveDraftMutation({
                id: docId,
                body: contentRef.current,
                frontmatter: frontmatterRef.current,
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
    }, [selectedFile, userId, ensureDocumentRecord, saveDraftMutation])

    return {
        isSaving,
        saveDraft,
        ensureDocumentRecord, // Exported so publish can use it
    }
}
