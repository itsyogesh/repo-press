"use client"

import { Eye, Maximize2, Minimize2 } from "lucide-react"
import * as React from "react"
import { PreviewRuntime } from "@/components/mdx-runtime/PreviewRuntime"
import { PreviewStatus } from "@/components/mdx-runtime/PreviewStatus"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { FieldVariantMap } from "@/lib/framework-adapters"
import { resolveFieldValue } from "@/lib/framework-adapters"
import type { RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"
import { resolveStudioAssetUrl } from "@/lib/studio/media-resolve"
import { cn } from "@/lib/utils"

import { DeviceFrame } from "./device-frame"
import { type Viewport, ViewportToggle } from "./viewport-toggle"

type TimerApi = Pick<typeof globalThis, "setTimeout" | "clearTimeout">

export function createCompileStatusForwarder(
  onCompilingChange?: (isCompiling: boolean) => void,
  settleDelayMs = 300,
  timers: TimerApi = globalThis,
) {
  let settleTimer: ReturnType<typeof setTimeout> | null = null
  let hasSeenCompilingState = false
  let lastEmitted: boolean | null = null

  const emit = (isCompiling: boolean) => {
    if (!onCompilingChange || lastEmitted === isCompiling) return
    lastEmitted = isCompiling
    onCompilingChange(isCompiling)
  }

  return {
    update(isCompiling: boolean) {
      if (!onCompilingChange) return

      if (settleTimer !== null) {
        timers.clearTimeout(settleTimer)
        settleTimer = null
      }

      if (isCompiling) {
        hasSeenCompilingState = true
        emit(true)
        return
      }

      if (!hasSeenCompilingState) return

      settleTimer = timers.setTimeout(() => {
        settleTimer = null
        emit(false)
      }, settleDelayMs)
    },
    cancel() {
      if (settleTimer !== null) {
        timers.clearTimeout(settleTimer)
        settleTimer = null
      }
    },
  }
}

interface PreviewProps {
  content: string
  frontmatter: Record<string, any>
  fieldVariants?: FieldVariantMap
  projectId?: string
  userId?: string
  filePath?: string
  contentRoot?: string
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
  onCompilingChange?: (isCompiling: boolean) => void
  adapter?: RepoPressPreviewAdapter | null
  adapterDiagnostics?: string[]
}

export function Preview({
  content,
  frontmatter,
  fieldVariants,
  projectId,
  userId,
  filePath,
  contentRoot = "",
  scrollContainerRef,
  onScroll,
  onCompilingChange,
  adapter,
  adapterDiagnostics,
}: PreviewProps) {
  const [viewport, setViewport] = React.useState<Viewport>("desktop")
  const [isFullScreen, setIsFullScreen] = React.useState(false)
  const [isCompiling, setIsCompiling] = React.useState(false)
  const [warnings, setWarnings] = React.useState<string[]>([])

  // Debounced content for preview (300ms delay)
  const [debouncedContent, setDebouncedContent] = React.useState(content)

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContent(content)
    }, 300)
    return () => clearTimeout(timer)
  }, [content])

  const title = resolveFieldValue(frontmatter, "title", fieldVariants) as string | undefined
  const date = resolveFieldValue(frontmatter, "date", fieldVariants) as string | undefined
  const rawImage = resolveFieldValue(frontmatter, "image", fieldVariants) as string | undefined
  const description = resolveFieldValue(frontmatter, "description", fieldVariants) as string | undefined
  const tags = resolveFieldValue(frontmatter, "tags", fieldVariants) as string[] | undefined
  const author = resolveFieldValue(frontmatter, "author", fieldVariants) as string | undefined

  const image = rawImage
    ? resolveStudioAssetUrl(rawImage, projectId, userId, filePath, undefined, contentRoot)
    : undefined
  const [imageError, setImageError] = React.useState(false)
  const fileName = filePath?.split("/").pop() || "Untitled"
  const formattedDate = React.useMemo(() => {
    if (!date) return null
    const value = new Date(date)
    if (Number.isNaN(value.getTime())) return null
    return value.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }, [date])

  // Reset image error when image URL changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset-on-change pattern
  React.useEffect(() => {
    setImageError(false)
  }, [image])

  // Stabilize the asset resolver to prevent infinite re-renders in PreviewRuntime
  const resolveAssetUrl = React.useMemo(() => {
    return (path: string) => resolveStudioAssetUrl(path, projectId, userId, filePath, undefined, contentRoot)
  }, [projectId, userId, filePath, contentRoot])

  const compileStatusForwarder = React.useMemo(
    () => createCompileStatusForwarder(onCompilingChange),
    [onCompilingChange],
  )

  React.useEffect(() => {
    compileStatusForwarder.update(isCompiling)
    return () => compileStatusForwarder.cancel()
  }, [compileStatusForwarder, isCompiling])

  // Escape exits full-screen
  React.useEffect(() => {
    if (!isFullScreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setIsFullScreen(false)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isFullScreen])

  const previewContent = (
    <article className="mx-auto flex w-full max-w-[980px] flex-col gap-6 px-4 py-5 md:px-6 md:py-6">
      <div className="overflow-hidden rounded-lg border border-studio-border/80 bg-studio-canvas">
        <div className="border-b border-studio-border/70 px-5 py-5 md:px-7">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-studio-fg-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-studio-border/60 bg-studio-canvas-inset/45 px-2.5 py-1">
              <Eye className="h-3 w-3" />
              Published view
            </span>
            <span className="rounded-full border border-studio-border/60 bg-studio-canvas-inset/45 px-2.5 py-1 normal-case tracking-normal">
              {fileName}
            </span>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-studio-fg md:text-3xl">
                {title || inferPreviewTitle(fileName)}
              </h1>
              {description ? <p className="max-w-2xl text-sm leading-6 text-studio-fg-muted">{description}</p> : null}
            </div>

            {(formattedDate || author || (tags && tags.length > 0)) && (
              <div className="flex flex-wrap items-center gap-2">
                {formattedDate ? (
                  <Badge variant="outline" className="rounded-full border-studio-border/70 px-2.5 py-1 text-[11px]">
                    {formattedDate}
                  </Badge>
                ) : null}
                {author ? (
                  <Badge variant="outline" className="rounded-full border-studio-border/70 px-2.5 py-1 text-[11px]">
                    by {author}
                  </Badge>
                ) : null}
                {tags?.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="rounded-full bg-studio-accent-muted px-2.5 py-1 text-[11px] text-studio-accent"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {image && !imageError && (
          <div className="border-b border-studio-border/70 px-4 py-4 md:px-7">
            <img
              src={image}
              alt={title || fileName}
              className="aspect-video w-full rounded-md border border-studio-border/60 object-cover"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          </div>
        )}

        <div className="px-5 py-6 md:px-7 md:py-8">
          <div
            data-scroll-sync-root="preview"
            className={cn("prose prose-neutral max-w-none dark:prose-invert", "prose-headings:scroll-mt-4")}
          >
            <PreviewRuntime
              source={debouncedContent}
              frontmatter={frontmatter}
              adapter={adapter ?? undefined}
              externalDiagnostics={adapterDiagnostics}
              resolveAssetUrl={resolveAssetUrl}
              onStatusChange={setIsCompiling}
              onWarningsChange={setWarnings}
            />
          </div>
        </div>
      </div>
    </article>
  )

  if (isFullScreen) {
    return (
      <div className="fixed inset-0 z-50 bg-studio-canvas flex flex-col font-sans">
        <div className="flex items-center justify-between border-b border-studio-border px-4 py-3 shrink-0 bg-studio-canvas">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-studio-fg-muted">Preview</span>
              <span className="truncate rounded-full border border-studio-border/60 bg-studio-canvas-inset/45 px-2 py-0.5 text-[11px] text-studio-fg">
                {fileName}
              </span>
            </div>
            <p className="text-sm text-studio-fg-muted">See the polished reading experience while you edit.</p>
          </div>
          <div className="flex items-center gap-3">
            <PreviewStatus isCompiling={isCompiling} warnings={warnings} />
            <ViewportToggle value={viewport} onChange={setViewport} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-md border border-studio-border/70 bg-studio-canvas-inset/45"
              onClick={() => setIsFullScreen(false)}
              title="Exit full-screen (Esc)"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-studio-canvas-inset/30">
          <DeviceFrame viewport={viewport}>{previewContent}</DeviceFrame>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-studio-canvas">
      <div className="flex items-center justify-between border-b border-studio-border px-4 py-3 shrink-0">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-studio-fg-muted">Preview</span>
            <span className="truncate rounded-full border border-studio-border/60 bg-studio-canvas-inset/45 px-2 py-0.5 text-[11px] text-studio-fg">
              {fileName}
            </span>
          </div>
          <p className="text-sm text-studio-fg-muted">Live rendering with device-aware framing.</p>
        </div>
        <div className="flex items-center gap-3">
          <PreviewStatus isCompiling={isCompiling} warnings={warnings} />
          <ViewportToggle value={viewport} onChange={setViewport} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-xl border border-studio-border/70 bg-studio-canvas-inset/45"
            onClick={() => setIsFullScreen(true)}
            title="Full-screen preview"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div ref={scrollContainerRef} onScroll={onScroll} className="flex-1 overflow-y-auto bg-studio-canvas-inset/30">
        <DeviceFrame viewport={viewport}>{previewContent}</DeviceFrame>
      </div>
    </div>
  )
}

function inferPreviewTitle(fileName: string) {
  return fileName.replace(/\.(mdx?|markdown)$/i, "") || "Untitled draft"
}
