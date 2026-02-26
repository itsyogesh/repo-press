"use client"

import { ExternalLink, GitPullRequest } from "lucide-react"
import * as React from "react"
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
            <GitPullRequest className="h-5 w-5" />
            {existingPrUrl ? "Push to PR" : "Create Pull Request"}
          </DialogTitle>
          <DialogDescription>
            {total} pending change{total !== 1 ? "s" : ""}:{" "}
            {summaryParts.join(", ")}
          </DialogDescription>
        </DialogHeader>

        {conflicts && conflicts.length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <p className="font-medium text-destructive mb-2">
              Conflicts detected:
            </p>
            <ul className="space-y-1">
              {conflicts.map((c) => (
                <li key={c.path} className="text-xs text-destructive">
                  <span className="font-mono">{c.path}</span>: {c.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {existingPrUrl && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ExternalLink className="h-4 w-4" />
            <a
              href={existingPrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              View existing PR
            </a>
          </div>
        )}

        {!existingPrUrl && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="prTitle">PR Title (optional)</Label>
              <Input
                id="prTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Content update: ${summaryParts.join(", ")}`}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="prDescription">Description (optional)</Label>
              <Textarea
                id="prDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your changes..."
                className="mt-1 h-20"
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
          >
            {isPublishing
              ? "Publishing..."
              : existingPrUrl
                ? "Push to PR"
                : "Create PR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
