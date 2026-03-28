"use client"

import { AlertTriangle, Hand, Loader2, Trash2 } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"

interface OrphanProject {
  _id: string
  name: string
  contentRoot: string
  configRemovedAt?: number
}

interface OrphanWarningCardProps {
  project: OrphanProject
  isOwner: boolean
  onResolved?: () => void
}

export function OrphanWarningCard({ project, isOwner, onResolved }: OrphanWarningCardProps) {
  const [keepPending, startKeep] = useTransition()
  const [deletePending, startDelete] = useTransition()
  const isPending = keepPending || deletePending

  const keepAsManual = useMutation(api.projects.keepAsManual)
  const removeFull = useMutation(api.projects.removeFull)

  const handleKeep = () => {
    startKeep(async () => {
      try {
        await keepAsManual({ projectId: project._id as Id<"projects"> })
        toast.success(`"${project.name}" kept as a manual project`)
        onResolved?.()
      } catch (err: any) {
        toast.error(err.message || "Failed to keep project")
      }
    })
  }

  const handleDelete = () => {
    startDelete(async () => {
      try {
        await removeFull({ id: project._id as Id<"projects"> })
        toast.success(`"${project.name}" deleted permanently`)
        onResolved?.()
      } catch (err: any) {
        toast.error(err.message || "Failed to delete project")
      }
    })
  }

  return (
    <Alert className="border-studio-attention/30 bg-studio-attention-muted/40">
      <AlertTriangle className="h-4 w-4 text-studio-attention" />
      <AlertTitle className="text-studio-attention text-sm font-medium">
        &ldquo;{project.name}&rdquo; was removed from config
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {project.contentRoot && (
            <span className="font-medium">{project.contentRoot}</span>
          )}
          {project.configRemovedAt && (
            <span> · Detected {new Date(project.configRemovedAt).toLocaleDateString()}</span>
          )}
        </div>
        {isOwner && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleKeep} disabled={isPending}>
              {keepPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Hand className="h-3.5 w-3.5 mr-1" />
              )}
              Keep as Manual
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
              {deletePending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1" />
              )}
              Delete Permanently
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}
