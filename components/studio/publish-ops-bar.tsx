"use client"

import { useState } from "react"
import { ExternalLink, GitPullRequest, X, FilePlus, FileEdit, FileX, ChevronDown, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

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

interface PublishOpsBarProps {
  creates: number
  deletes: number
  edits: number
  pendingOps?: PendingOp[]
  dirtyDocs?: DirtyDoc[]
  prUrl?: string | null
  onPublish: () => void
  onDiscard: () => void
  onSelectFile?: (path: string) => void
}

export function PublishOpsBar({
  creates,
  deletes,
  edits,
  pendingOps = [],
  dirtyDocs = [],
  prUrl,
  onPublish,
  onDiscard,
  onSelectFile,
}: PublishOpsBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const total = creates + deletes + edits
  if (total === 0) return null

  const newFiles = pendingOps.filter((op) => op.opType === "create" && op.status === "pending")
  const deletedFiles = pendingOps.filter((op) => op.opType === "delete" && op.status === "pending")
  const modifiedFiles = dirtyDocs || []

  const handleFileClick = (filePath: string) => {
    if (onSelectFile) {
      onSelectFile(filePath)
    }
  }

  return (
    <div className="shrink-0 border-t border-studio-border bg-studio-canvas-inset px-3 py-2 space-y-2">
      <div
        className="flex items-center gap-2 text-xs text-studio-fg cursor-pointer hover:opacity-80"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-studio-accent" />
        <span className="font-medium">
          {total} pending change{total !== 1 ? "s" : ""}
        </span>
        {isExpanded ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-studio-accent hover:underline inline-flex items-center gap-1 ml-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
            PR
          </a>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-2 text-xs">
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
                  className="w-full text-left pl-4 py-1 hover:bg-studio-accent/10 cursor-pointer rounded truncate text-studio-fg"
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
                  className="w-full text-left pl-4 py-1 hover:bg-studio-accent/10 cursor-pointer rounded truncate text-studio-fg"
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
                  className="w-full text-left pl-4 py-1 hover:bg-studio-danger/10 cursor-pointer rounded truncate text-studio-fg"
                  onClick={() => handleFileClick(file.filePath)}
                  title={file.filePath}
                >
                  {file.filePath.split("/").pop()}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!isExpanded && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {creates > 0 && (
            <Badge variant="secondary" className="h-5 text-[10px] bg-studio-success-muted text-studio-success border-0">
              +{creates} new
            </Badge>
          )}
          {edits > 0 && (
            <Badge variant="secondary" className="h-5 text-[10px] bg-studio-accent-muted text-studio-accent border-0">
              ~{edits} modified
            </Badge>
          )}
          {deletes > 0 && (
            <Badge variant="secondary" className="h-5 text-[10px] bg-red-500/15 text-studio-danger border-0">
              -{deletes} deleted
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 h-7 text-xs text-studio-fg-muted hover:text-studio-danger"
          onClick={onDiscard}
        >
          <X className="h-3 w-3 mr-1" />
          Discard
        </Button>
        <Button size="sm" className="flex-1 h-7 text-xs bg-studio-accent hover:bg-studio-accent/90" onClick={onPublish}>
          Publish to PR →
        </Button>
      </div>
    </div>
  )
}
