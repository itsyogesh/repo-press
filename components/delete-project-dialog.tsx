"use client"

import { useMutation } from "convex/react"
import { Loader2, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

interface DeleteProjectDialogProps {
  project: { _id: string; name: string } | null
  /** actingUserId resolved server-side (OAuth or PAT). Optional — Convex session covers OAuth users. */
  userId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function DeleteProjectDialog({ project, userId, open, onOpenChange, onSuccess }: DeleteProjectDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  // Note: removeFull authorization relies on the Convex Better Auth session (OAuth users) or a
  // projectAccessToken. PAT-only users cannot call this mutation from a client component without
  // a projectAccessToken — the same limitation applies to OrphanWarningCard.
  const removeFull = useMutation(api.projects.removeFull)

  const handleDelete = async () => {
    if (!project) return
    setIsDeleting(true)
    try {
      await removeFull({
        projectId: project._id as Id<"projects">,
        userId: userId ?? undefined,
      })
      toast.success(`"${project.name}" deleted`)
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      toast.error(err.message || "Failed to delete project")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{project?.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{project?.name}</strong> and all its drafts, history, and metadata in
            RepoPress. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="focus-visible:ring-destructive/20"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Project
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
