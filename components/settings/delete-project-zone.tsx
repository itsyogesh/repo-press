"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, Trash2, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { Doc } from "@/convex/_generated/dataModel"

interface DeleteProjectZoneProps {
  project: Doc<"projects">
}

export function DeleteProjectZone({ project }: DeleteProjectZoneProps) {
  const router = useRouter()
  const [confirmName, setConfirmName] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const removeFull = useMutation(api.projects.removeFull)

  const isConfigDriven = project.frameworkSource === "config"

  const handleDelete = async () => {
    if (confirmName !== project.name) return

    setIsDeleting(true)
    try {
      await removeFull({ projectId: project._id })
      toast.success("Project deleted successfully")
      router.push(`/dashboard/${project.repoOwner}/${project.repoName}`)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || "Failed to delete project")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-6">
      <div className="flex items-center gap-2 text-red-800 mb-4">
        <AlertCircle className="h-5 w-5" />
        <h2 className="text-lg font-bold uppercase tracking-tight">Danger Zone</h2>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-red-700">
          Deleting this project will permanently remove all drafts, version history, and metadata associated with it in
          RepoPress. This action cannot be undone.
        </p>

        {isConfigDriven && (
          <Alert className="bg-amber-50 border-amber-200 text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-xs font-bold uppercase tracking-tight text-amber-900">
              Source of Truth Warning
            </AlertTitle>
            <AlertDescription className="text-xs text-amber-800">
              This project is defined in your <code className="bg-amber-100 px-1 rounded">repopress.config.json</code>.
              Deleting it here will clear local state, but the project will reappear if you sync again unless you also
              remove it from your config file on GitHub.
            </AlertDescription>
          </Alert>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full sm:w-auto">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Project
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the <strong>{project.name}</strong> project and all its associated data. This action is
                irreversible.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="my-4 space-y-2">
              <Label htmlFor="confirmName" className="text-sm">
                Type <span className="font-mono font-bold text-foreground">{project.name}</span> to confirm:
              </Label>
              <Input
                id="confirmName"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={project.name}
                className="border-red-200 focus-visible:ring-red-500"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmName("")}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={confirmName !== project.name || isDeleting}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete Project"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
