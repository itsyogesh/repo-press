import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * RepoPress brand — the "publish caret".
 *
 * A caret that ships content up to `main`, with a Signal-Slate commit node
 * lifting off the tip (also reading as a branch junction). Slate appears only
 * on the node. The earlier "RP" monogram is retired.
 *
 * The mark inherits theme tokens so it adapts to the app's light/dark theme:
 * - `tile`: inverse rounded tile (ink on light, paper on dark) with the caret
 *   in the page color — the canonical mark used in nav + app shells.
 * - bare: caret strokes in `currentColor`, for inline use on matching surfaces.
 */
function BrandMark({ tile = false, className, ...props }: React.ComponentProps<"svg"> & { tile?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label="RepoPress"
      className={cn("shrink-0", className)}
      {...props}
    >
      {tile ? <rect width="100" height="100" rx="23" className="fill-foreground" /> : null}
      <g
        className={tile ? "stroke-background" : "stroke-current"}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="miter"
        strokeMiterlimit="8"
      >
        <path d="M26 75 L49 48 L73 71" />
        <path d="M49 48 L49 42" />
      </g>
      <circle cx="49" cy="30" r="7.6" className="fill-primary" />
    </svg>
  )
}

/**
 * Logo lockup — the publish-caret mark + "RepoPress" wordmark and the
 * "Git-native studio" tagline. Presentational (wrap in a Link where needed).
 */
function Logo({
  tagline = true,
  tile = true,
  markClassName,
  className,
}: {
  tagline?: boolean
  tile?: boolean
  markClassName?: string
  className?: string
}) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <BrandMark tile={tile} className={cn("size-10", markClassName)} />
      <span className="flex flex-col">
        <span className="text-sm font-semibold tracking-[-0.03em] text-foreground">RepoPress</span>
        {tagline ? (
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
            Git-native studio
          </span>
        ) : null}
      </span>
    </span>
  )
}

export { BrandMark, Logo }
