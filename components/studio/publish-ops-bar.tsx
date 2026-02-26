"use client"

import { ExternalLink, GitPullRequest, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PublishOpsBarProps {
  creates: number
  deletes: number
  edits: number
  prUrl?: string | null
  onPublish: () => void
  onDiscard: () => void
}

export function PublishOpsBar({
  creates,
  deletes,
  edits,
  prUrl,
  onPublish,
  onDiscard,
}: PublishOpsBarProps) {
  const total = creates + deletes + edits
  if (total === 0) return null

  const parts: string[] = []
  if (creates > 0) parts.push(`${creates} new`)
  if (edits > 0) parts.push(`${edits} modified`)
  if (deletes > 0) parts.push(`${deletes} deleted`)

  return (
    <div className="shrink-0 border-t bg-muted/50 px-3 py-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
        <GitPullRequest className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{parts.join(", ")}</span>
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-foreground hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            PR
          </a>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={onDiscard}
        >
          <X className="h-3 w-3 mr-1" />
          Discard
        </Button>
        <Button size="sm" className="h-7 text-xs px-2" onClick={onPublish}>
          Publish to PR
        </Button>
      </div>
    </div>
  )
}
