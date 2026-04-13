"use client"

import { ChevronDown, ChevronRight, ExternalLink, FileEdit, FilePlus, FileX, GitPullRequest, X } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PendingOp {
  _id: string
  opType: "create" | "delete"
  filePath: string
  status: string
}

interface DirtyDoc {
  _id: string
  filePath: string
  title?: string
}

interface PendingMediaOp {
  _id: string
  repoPath: string
  fileName: string
  status: string
  sourceFilePath?: string
}

interface PublishOpsBarProps {
  creates: number
  deletes: number
  edits: number
  media?: number
  pendingOps?: PendingOp[]
  dirtyDocs?: DirtyDoc[]
  pendingMediaOps?: PendingMediaOp[]
  hasCurrentLane?: boolean
  currentPrNumber?: number | null
  currentPrUrl?: string | null
  isDiscarding?: boolean
  onPublish: () => void
  onDiscard: () => void
  onSelectFile?: (path: string) => void
}

export function PublishOpsBar({
  creates,
  deletes,
  edits,
  media = 0,
  pendingOps = [],
  dirtyDocs = [],
  pendingMediaOps = [],
  hasCurrentLane = false,
  currentPrNumber,
  currentPrUrl,
  isDiscarding = false,
  onPublish,
  onDiscard,
  onSelectFile,
}: PublishOpsBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const total = creates + deletes + edits + media
  if (total === 0) return null

  const newFiles = pendingOps.filter((op) => op.opType === "create" && op.status === "pending")
  const deletedFiles = pendingOps.filter((op) => op.opType === "delete" && op.status === "pending")
  const mediaFiles = pendingMediaOps.filter((op) => op.status === "pending")

  // Filter out documents that are already in newFiles to avoid duplication
  const newFilePaths = new Set(newFiles.map((f) => f.filePath))
  const modifiedFiles = (dirtyDocs || []).filter((doc) => !newFilePaths.has(doc.filePath))

  const handleFileClick = (filePath: string) => {
    if (onSelectFile) {
      onSelectFile(filePath)
    }
  }

  const summaryBadges = [
    creates > 0
      ? {
          key: "creates",
          label: `+${creates} new`,
          className: "border-studio-success/20 bg-studio-success-muted text-studio-success",
        }
      : null,
    edits > 0
      ? {
          key: "edits",
          label: `~${edits} modified`,
          className: "border-studio-accent/20 bg-studio-accent-muted text-studio-accent",
        }
      : null,
    deletes > 0
      ? {
          key: "deletes",
          label: `-${deletes} deleted`,
          className: "border-studio-danger/20 bg-studio-danger/10 text-studio-danger",
        }
      : null,
    media > 0
      ? {
          key: "media",
          label: `+${media} media`,
          className: "border-studio-accent/20 bg-studio-accent-muted text-studio-accent",
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; className: string }>

  return (
    <div className="shrink-0 border-t border-studio-border bg-studio-canvas-inset/70 px-3 py-3">
      <div className="rounded-[1.25rem] border border-studio-border/70 bg-studio-canvas px-3 py-3 shadow-sm">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-3 text-left transition-opacity hover:opacity-90"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-studio-accent/15 bg-studio-accent-muted text-studio-accent">
              <GitPullRequest className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-studio-fg">
                  {total} pending change{total !== 1 ? "s" : ""}
                </span>
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-studio-fg-muted" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-studio-fg-muted" />
                )}
              </div>
              <p className="mt-1 text-xs text-studio-fg-muted">
                Review everything that will ship together in the next publish lane.
              </p>
            </div>
          </button>
          {currentPrUrl && (
            <a
              href={currentPrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-studio-accent/15 bg-studio-accent-muted px-2.5 py-1 text-[11px] font-medium text-studio-accent hover:opacity-90"
            >
              <ExternalLink className="h-3 w-3" />
              {currentPrNumber != null ? `PR #${currentPrNumber}` : "Current PR"}
            </a>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {summaryBadges.map((badge) => (
            <Badge
              key={badge.key}
              variant="secondary"
              className={cn("h-6 rounded-full border px-2 text-[10px] font-medium", badge.className)}
            >
              {badge.label}
            </Badge>
          ))}
        </div>

        {isExpanded && (
          <div className="mt-3 space-y-3 rounded-[1rem] border border-studio-border/60 bg-studio-canvas-inset/35 p-3 text-xs">
            {newFiles.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-studio-success">
                  <FilePlus className="h-3 w-3" />
                  <span className="font-medium">{newFiles.length} new</span>
                </div>
                {newFiles.map((file) => (
                  <button
                    type="button"
                    key={file._id}
                    className="w-full truncate rounded-lg py-1 pl-4 text-left text-studio-fg transition-colors hover:bg-studio-success-muted/60"
                    onClick={() => handleFileClick(file.filePath)}
                    title={file.filePath}
                  >
                    {file.filePath.split("/").pop()}
                  </button>
                ))}
              </div>
            )}

            {modifiedFiles.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-studio-accent">
                  <FileEdit className="h-3 w-3" />
                  <span className="font-medium">{modifiedFiles.length} modified</span>
                </div>
                {modifiedFiles.map((file) => (
                  <button
                    type="button"
                    key={file._id}
                    className="w-full truncate rounded-lg py-1 pl-4 text-left text-studio-fg transition-colors hover:bg-studio-accent-muted/60"
                    onClick={() => handleFileClick(file.filePath)}
                    title={file.filePath}
                  >
                    {file.filePath.split("/").pop()}
                  </button>
                ))}
              </div>
            )}

            {deletedFiles.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-studio-danger">
                  <FileX className="h-3 w-3" />
                  <span className="font-medium">{deletedFiles.length} deleted</span>
                </div>
                {deletedFiles.map((file) => (
                  <button
                    type="button"
                    key={file._id}
                    className="w-full truncate rounded-lg py-1 pl-4 text-left text-studio-fg transition-colors hover:bg-studio-danger/10"
                    onClick={() => handleFileClick(file.filePath)}
                    title={file.filePath}
                  >
                    {file.filePath.split("/").pop()}
                  </button>
                ))}
              </div>
            )}

            {mediaFiles.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-studio-accent">
                  <FileEdit className="h-3 w-3" />
                  <span className="font-medium">{mediaFiles.length} media</span>
                </div>
                {mediaFiles.map((file) => (
                  <button
                    type="button"
                    key={file._id}
                    className="w-full truncate rounded-lg py-1 pl-4 text-left text-studio-fg transition-colors hover:bg-studio-accent-muted/60"
                    onClick={() => file.sourceFilePath && handleFileClick(file.sourceFilePath)}
                    title={file.repoPath}
                  >
                    {file.fileName}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 flex-1 rounded-xl border border-studio-border/70 text-xs text-studio-fg-muted hover:bg-studio-danger/10 hover:text-studio-danger"
            disabled={isDiscarding}
            onClick={onDiscard}
          >
            <X className="mr-1 h-3 w-3" />
            {isDiscarding ? "Discarding..." : "Discard"}
          </Button>
          <Button
            size="sm"
            className="h-9 flex-1 rounded-xl bg-studio-accent text-xs text-studio-accent-fg shadow-sm hover:bg-studio-accent/90"
            onClick={onPublish}
          >
            {hasCurrentLane
              ? currentPrNumber != null
                ? "Update current PR →"
                : "Continue current lane →"
              : "Create new PR →"}
          </Button>
        </div>
      </div>
    </div>
  )
}
