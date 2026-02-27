"use client"

import { AlertTriangle, ExternalLink, FilePlus, FileMinus, FileEdit, GitPullRequest } from "lucide-react"
import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface PublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pendingCounts: { creates: number; deletes: number; edits: number }
  existingPrUrl?: string | null
  isPublishing: boolean
  onConfirm: (title?: string, description?: string) => void
  conflicts?: { path: string; reason: string }[]
}

export function PublishDialog({
  open,
  onOpenChange,
  pendingCounts,
  existingPrUrl,
  isPublishing,
  onConfirm,
  conflicts,
}: PublishDialogProps) {
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")

  const { creates, deletes, edits } = pendingCounts
  const total = creates + deletes + edits
  const summaryParts: string[] = []
  if (creates > 0) summaryParts.push(`${creates} new`)
  if (edits > 0) summaryParts.push(`${edits} modified`)
  if (deletes > 0) summaryParts.push(`${deletes} deleted`)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest className="h-5 w-5 text-studio-accent" />
            {existingPrUrl ? "Push to PR" : "Publish Changes"}
          </DialogTitle>
          <DialogDescription>
            Review your changes before publishing to GitHub.
          </DialogDescription>
        </DialogHeader>

        {/* Change Summary */}
        <div className="rounded-lg border border-studio-border bg-studio-canvas-inset p-3">
          <p className="text-xs font-semibold text-studio-fg uppercase tracking-wider mb-2">Summary</p>
          <div className="flex items-center gap-2 flex-wrap">
            {creates > 0 && (
              <Badge variant="secondary" className="gap-1 bg-studio-success-muted text-studio-success border-0">
                <FilePlus className="h-3 w-3" />
                {creates} file{creates !== 1 ? "s" : ""} created
              </Badge>
            )}
            {edits > 0 && (
              <Badge variant="secondary" className="gap-1 bg-studio-accent-muted text-studio-accent border-0">
                <FileEdit className="h-3 w-3" />
                {edits} file{edits !== 1 ? "s" : ""} modified
              </Badge>
            )}
            {deletes > 0 && (
              <Badge variant="secondary" className="gap-1 bg-red-500/15 text-studio-danger border-0">
                <FileMinus className="h-3 w-3" />
                {deletes} file{deletes !== 1 ? "s" : ""} deleted
              </Badge>
            )}
          </div>
        </div>

        {/* Conflicts */}
        {conflicts && conflicts.length > 0 && (
          <div className="rounded-lg border border-studio-danger/30 bg-studio-danger/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-studio-danger" />
              <p className="font-semibold text-sm text-studio-danger">
                {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} detected
              </p>
            </div>
            <ul className="space-y-1">
              {conflicts.map((c) => (
                <li key={c.path} className="text-xs text-studio-fg-muted">
                  <span className="font-mono text-studio-danger">{c.path}</span>: {c.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Existing PR Link */}
        {existingPrUrl && (
          <div className="flex items-center gap-2 text-sm text-studio-fg-muted">
            <ExternalLink className="h-4 w-4" />
            <a
              href={existingPrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-studio-fg transition-colors"
            >
              View existing PR
            </a>
          </div>
        )}

        {/* PR Form (new PR only) */}
        {!existingPrUrl && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="prTitle" className="text-sm font-medium">PR Title</Label>
              <Input
                id="prTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Content update: ${summaryParts.join(", ")}`}
                className="mt-1.5 border-studio-border"
              />
            </div>
            <div>
              <Label htmlFor="prDescription" className="text-sm font-medium">Description (optional)</Label>
              <Textarea
                id="prDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your changes..."
                className="mt-1.5 h-20 border-studio-border resize-none"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPublishing}
          >
            Cancel
          </Button>
          <Button
            onClick={() =>
              onConfirm(title || undefined, description || undefined)
            }
            disabled={isPublishing || (conflicts != null && conflicts.length > 0)}
            className="bg-studio-accent hover:bg-studio-accent/90"
          >
            {isPublishing
              ? "Publishing..."
              : existingPrUrl
                ? "Push to PR →"
                : "Create PR →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
