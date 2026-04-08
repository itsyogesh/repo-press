"use client"

import { Loader2, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DeleteProjectDialogProps {
  project: { _id: string; name: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function DeleteProjectDialog({ project, open, onOpenChange, onSuccess }: DeleteProjectDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmName, setConfirmName] = useState("")

  useEffect(() => {
    if (!open) setConfirmName("")
  }, [open])

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
            This will permanently delete{" "}
            <button
              type="button"
              className="inline font-bold cursor-pointer hover:underline bg-transparent border-0 p-0 text-inherit"
              title="Click to fill"
              onClick={() => setConfirmName(project?.name ?? "")}
            >
              {project?.name}
            </button>{" "}
            and all its drafts, history, and metadata in RepoPress. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="my-4 space-y-2">
          <Label htmlFor="confirmDeleteName" className="text-sm">
            Type{" "}
            <button
              type="button"
              className="inline font-mono font-bold text-foreground cursor-pointer hover:underline bg-transparent border-0 p-0 text-sm"
              title="Click to fill"
              onClick={() => setConfirmName(project?.name ?? "")}
            >
              {project?.name}
            </button>{" "}
            to confirm:
          </Label>
          <Input
            id="confirmDeleteName"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={project?.name ?? ""}
            className="border-destructive/25 focus-visible:ring-destructive/20"
            disabled={isDeleting}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || confirmName !== (project?.name ?? "")}
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
