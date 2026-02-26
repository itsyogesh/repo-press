import * as React from "react"
import { Check, Loader2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useViewMode } from "./view-mode-context"

interface StudioFooterProps {
  isSaving: boolean
  lastSavedAt?: number | null
  fileType?: string
  encoding?: string
}

export function StudioFooter({
  isSaving,
  lastSavedAt,
  fileType = "MDX",
  encoding = "UTF-8",
}: StudioFooterProps) {
  const { viewMode } = useViewMode()

  return (
    <footer className="flex h-full w-full items-center justify-between text-xs text-muted-foreground px-4">
      {/* Left: Save Status */}
      <div className="flex items-center gap-1.5 flex-1 select-none">
        {isSaving ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-studio-accent" />
            <span>Saving...</span>
          </>
        ) : lastSavedAt ? (
          <>
            <Check className="h-3 w-3 text-studio-success" />
            <span>Draft saved {formatDistanceToNow(lastSavedAt)} ago</span>
          </>
        ) : (
          <span>No unsaved changes</span>
        )}
      </div>

      {/* Center: View Mode (hidden on narrow screens) */}
      <div className="hidden sm:flex items-center justify-center flex-1 font-medium capitalize select-none">
        {viewMode} Mode
      </div>

      {/* Right: File Info */}
      <div className="flex items-center justify-end flex-1 gap-4 select-none">
        <span className="cursor-default hover:text-foreground transition-colors">{fileType}</span>
        <span className="cursor-default hover:text-foreground transition-colors">{encoding}</span>
      </div>
    </footer>
  )
}
