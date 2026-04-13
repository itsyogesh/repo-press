"use client"

import { formatDistanceToNow } from "date-fns"
import { Check, CircleDotDashed, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useViewMode } from "./view-mode-context"

interface StudioFooterProps {
  isSaving: boolean
  lastSavedAt?: number | null
  fileType?: string
  encoding?: string
  filePath?: string
  pendingChanges?: number
}

export function StudioFooter({
  isSaving,
  lastSavedAt,
  fileType = "MDX",
  encoding = "UTF-8",
  filePath,
  pendingChanges = 0,
}: StudioFooterProps) {
  const { viewMode } = useViewMode()

  return (
    <footer className="flex h-full w-full items-center gap-2 px-3 text-[11px] text-studio-fg-muted">
      <div className="flex min-w-0 flex-1 items-center gap-2 select-none">
        <div className="flex items-center gap-1.5 rounded-full border border-studio-border/70 bg-studio-canvas-inset/60 px-2.5 py-1">
          <CircleDotDashed className="h-3 w-3 text-studio-fg-muted" />
          <span className="font-medium text-studio-fg">{viewMode}</span>
          <span className="hidden sm:inline">view</span>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-studio-border/70 bg-studio-canvas-inset/40 px-2.5 py-1">
          {isSaving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-studio-accent" />
              <span className="font-medium text-studio-fg">Saving draft…</span>
            </>
          ) : lastSavedAt ? (
            <>
              <Check className="h-3 w-3 text-studio-success" />
              <span className="truncate">
                <span className="font-medium text-studio-fg">Saved</span> {formatDistanceToNow(lastSavedAt)} ago
              </span>
            </>
          ) : (
            <span className="font-medium text-studio-fg">No unsaved changes</span>
          )}
        </div>

        {filePath ? (
          <div className="hidden min-w-0 items-center rounded-full border border-studio-border/60 bg-studio-canvas px-2.5 py-1 md:flex">
            <span className="truncate">{filePath}</span>
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center justify-end gap-1.5 select-none">
        {pendingChanges > 0 ? (
          <div className="hidden items-center rounded-full border border-studio-accent/20 bg-studio-accent-muted px-2.5 py-1 text-studio-accent sm:flex">
            <span className="font-medium">{pendingChanges}</span>
            <span className="ml-1">pending</span>
          </div>
        ) : null}
        {[fileType, encoding].map((value) => (
          <div
            key={value}
            className={cn(
              "rounded-full border border-studio-border/70 bg-studio-canvas-inset/40 px-2.5 py-1 font-medium",
              value === fileType && "text-studio-fg",
            )}
          >
            {value}
          </div>
        ))}
      </div>
    </footer>
  )
}
