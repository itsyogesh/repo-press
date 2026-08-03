"use client"

import { AlertTriangle, Loader2, Trash2 } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { removeProjectFromConfigAction } from "@/app/dashboard/[owner]/[repo]/config-actions"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog"
import { Input } from "./ui/input"
import { Label } from "./ui/label"

interface RemovableProject {
  _id: string
  name: string
  contentRoot: string
  configProjectId?: string
  frameworkSource?: string
}

interface RemoveProjectDialogProps {
  owner: string
  repo: string
  defaultBranch: string
  project: RemovableProject | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function RemoveProjectDialog({
  owner,
  repo,
  defaultBranch,
  project,
  open,
  onOpenChange,
  onSuccess,
}: RemoveProjectDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [confirmText, setConfirmText] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Reset form state whenever the dialog closes, regardless of how it was closed
  // (Cancel button, Escape key, overlay click, or programmatic close after success).
  useEffect(() => {
    if (!open) {
      setConfirmText("")
      setError(null)
    }
  }, [open])

  if (!project) return null

  const isConfigManaged = project.frameworkSource === "config" && !!project.configProjectId
  const confirmRequired = project.name.toLowerCase()

  const handleRemove = () => {
    if (confirmText.toLowerCase() !== confirmRequired) {
      setError(`Type "${project.name}" to confirm`)
      return
    }

    if (!project.configProjectId) {
      setError("Only config-managed projects can be removed from config")
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await removeProjectFromConfigAction(owner, repo, defaultBranch, project.configProjectId!)

      if (result.success) {
        toast.success(`Project "${project.name}" removed from config`)
        onOpenChange(false)
        onSuccess?.()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        // Same Radix aria-hidden race fix as EditProjectDialog - see that file for details.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="rp-display flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Remove Project
          </DialogTitle>
          <DialogDescription>
            {isConfigManaged ? (
              <>
                This will remove <strong>{project.name}</strong> from the config file on GitHub. The project data in
                RepoPress will be flagged for review - you can choose to delete it permanently or keep it as a manual
                project.
              </>
            ) : (
              <>
                This project is not managed by the config file. Use the project settings page to delete it permanently.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {isConfigManaged && (
          <div className="grid gap-4 py-4">
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">What happens when you remove a project:</p>
              <ul className="mt-2 list-disc list-inside text-muted-foreground space-y-1">
                <li>The project entry is removed from repopress.config.json</li>
                <li>The change is committed to the {defaultBranch} branch</li>
                <li>The project will be flagged as &ldquo;removed from config&rdquo; in RepoPress</li>
                <li>You can then choose to delete it permanently or keep it</li>
              </ul>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="confirm-remove">
                Type{" "}
                <button
                  type="button"
                  className="inline font-medium cursor-pointer hover:underline bg-transparent border-0 p-0 text-inherit"
                  title="Click to fill"
                  onClick={() => setConfirmText(project.name)}
                >
                  {project.name}
                </button>{" "}
                to confirm
              </Label>
              <Input
                id="confirm-remove"
                placeholder={project.name}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={isPending}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          {isConfigManaged && (
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={isPending || confirmText.toLowerCase() !== confirmRequired}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove from Config
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
