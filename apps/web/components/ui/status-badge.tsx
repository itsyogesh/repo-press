import type * as React from "react"

import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from "@/lib/document-status"
import { cn } from "@/lib/utils"

/**
 * StatusBadge — the document-workflow status pill (RepoPress Editorial).
 *
 * Status reads as shape + tone (dot + tinted pill), never color alone:
 * draft = gray · in_review = amber · approved = emerald · published = green
 * (the only solid fill) · scheduled = slate · archived = muted. Mono,
 * uppercase, 9999px radius. Use this — not the generic Badge — for any
 * document state. Set `dot={false}` to drop the leading dot in dense rows.
 */

const STATUS_STYLES: Record<DocumentStatus, string> = {
  draft: "text-[var(--status-draft-fg)] bg-[var(--status-draft-bg)] border-[var(--status-draft-border)]",
  in_review: "text-[var(--status-review-fg)] bg-[var(--status-review-bg)] border-[var(--status-review-border)]",
  approved: "text-[var(--status-approved-fg)] bg-[var(--status-approved-bg)] border-[var(--status-approved-border)]",
  published:
    "text-[var(--status-published-fg)] bg-[var(--status-published-bg)] border-[var(--status-published-border)]",
  scheduled:
    "text-[var(--status-scheduled-fg)] bg-[var(--status-scheduled-bg)] border-[var(--status-scheduled-border)]",
  archived: "text-[var(--status-archived-fg)] bg-[var(--status-archived-bg)] border-[var(--status-archived-border)]",
}

const SIZE_STYLES = {
  sm: "h-[18px] gap-1 px-1.5 text-[9px]",
  md: "h-[22px] gap-1.5 px-2.5 text-[11px]",
} as const

const DOT_STYLES = {
  sm: "size-1",
  md: "size-1.5",
} as const

function StatusBadge({
  status,
  dot = true,
  size = "md",
  className,
  ...props
}: React.ComponentProps<"span"> & {
  status: DocumentStatus
  dot?: boolean
  size?: keyof typeof SIZE_STYLES
}) {
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full border font-mono font-medium uppercase leading-none tracking-[0.06em] whitespace-nowrap transition-colors",
        SIZE_STYLES[size],
        statusStyle,
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn("shrink-0 rounded-full bg-current", DOT_STYLES[size])} /> : null}
      {DOCUMENT_STATUS_LABELS[status] ?? "Draft"}
    </span>
  )
}

export { StatusBadge }
