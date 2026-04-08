"use client"

import { useMutation, useQuery } from "convex/react"
import { AlertCircle, AlertTriangle, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"

interface DeleteProjectZoneProps {
  project: Doc<"projects">
  projectAccessToken?: string
}

export function DeleteProjectZone({ project, projectAccessToken }: DeleteProjectZoneProps) {
  const router = useRouter()
  const user = useQuery(api.auth.getCurrentUser)
  const [confirmName, setConfirmName] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const removeFull = useMutation(api.projects.removeFull)

  const isConfigDriven = project.frameworkSource === "config"

  const handleDelete = async () => {
    if (confirmName !== project.name) return

    setIsDeleting(true)
    try {
      await removeFull({
        projectId: project._id,
        userId: (user?._id as string | undefined) ?? undefined,
        projectAccessToken: projectAccessToken || undefined,
      })
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
    <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-6">
      <div className="mb-4 flex items-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <h2 className="text-lg font-bold uppercase tracking-tight">Danger Zone</h2>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-destructive/90">
          Deleting this project will permanently remove all drafts, version history, and metadata associated with it in
          RepoPress. This action cannot be undone.
        </p>

        {isConfigDriven && (
          <Alert className="border-studio-attention/25 bg-studio-attention-muted text-studio-attention">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-xs font-bold uppercase tracking-tight text-studio-attention">
              Source of Truth Warning
            </AlertTitle>
            <AlertDescription className="text-xs text-studio-attention">
              This project is defined in your{" "}
              <code className="rounded bg-background/70 px-1 text-foreground">repopress.config.json</code>. Deleting it
              here will clear local state, but the project will reappear if you sync again unless you also remove it
              from your config file on GitHub.
            </AlertDescription>
          </Alert>
        )}

        <AlertDialog
          onOpenChange={(o) => {
            if (!o) setConfirmName("")
          }}
        >
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
                This will delete the{" "}
                <button
                  type="button"
                  className="inline font-bold text-foreground cursor-pointer hover:underline bg-transparent border-0 p-0 text-inherit"
                  title="Click to fill"
                  onClick={() => setConfirmName(project.name)}
                >
                  {project.name}
                </button>{" "}
                project and all its associated data. This action is irreversible.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="my-4 space-y-2">
              <Label htmlFor="confirmName" className="text-sm">
                Type{" "}
                <button
                  type="button"
                  className="inline font-mono font-bold text-foreground cursor-pointer hover:underline bg-transparent border-0 p-0 text-sm"
                  title="Click to fill"
                  onClick={() => setConfirmName(project.name)}
                >
                  {project.name}
                </button>{" "}
                to confirm:
              </Label>
              <Input
                id="confirmName"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={project.name}
                className="border-destructive/25 focus-visible:ring-destructive/20"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmName("")}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={handleDelete}
                disabled={confirmName !== project.name || isDeleting}
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
