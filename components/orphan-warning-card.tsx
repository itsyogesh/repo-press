"use client"

import { AlertTriangle, Hand, Loader2, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { keepProjectAsManualAction } from "@/app/dashboard/[owner]/[repo]/config-actions"
import { DeleteProjectDialog } from "./delete-project-dialog"
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleKeep = () => {
    startKeep(async () => {
      const result = await keepProjectAsManualAction(project._id)
      if (result.success) {
        toast.success(`"${project.name}" kept as a manual project`)
        onResolved?.()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <Alert className="border-studio-attention/30 bg-studio-attention-muted/40">
        <AlertTriangle className="h-4 w-4 text-studio-attention" />
        <AlertTitle className="text-studio-attention text-sm font-medium">
          &ldquo;{project.name}&rdquo; was removed from config
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {project.contentRoot && <span className="font-medium">{project.contentRoot}</span>}
            {project.configRemovedAt && (
              <span> · Detected {new Date(project.configRemovedAt).toLocaleDateString()}</span>
            )}
          </div>
          {isOwner && (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleKeep} disabled={keepPending}>
                {keepPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Hand className="h-3.5 w-3.5 mr-1" />
                )}
                Keep as Manual
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)} disabled={keepPending}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete Permanently
              </Button>
            </div>
          )}
        </AlertDescription>
      </Alert>
      <DeleteProjectDialog
        project={project}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={() => onResolved?.()}
      />
    </>
  )
}
