"use client"

import { Loader2, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { deleteProjectPermanentlyAction } from "@/app/dashboard/[owner]/[repo]/config-actions"
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

interface DeleteProjectDialogProps {
  project: { _id: string; name: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function DeleteProjectDialog({ project, open, onOpenChange, onSuccess }: DeleteProjectDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!project) return
    setIsDeleting(true)
    try {
      const result = await deleteProjectPermanentlyAction(project._id)
      if (!result.success) {
        throw new Error(result.error)
      }
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
