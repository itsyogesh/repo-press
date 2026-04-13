"use client"

import { Info } from "lucide-react"
import React from "react"

import { getVideoInfo } from "@/lib/studio/video-embed"
import { cn } from "@/lib/utils"

/**
 * DocsImage - Display an image with optional alt text and caption.
 * Matches the rich rendering style used in standardComponents.
 */
export const DocsImage = React.forwardRef<
  HTMLDivElement,
  { src: string; alt?: string; caption?: string; resolveAssetUrl?: (path: string) => string }
>(({ src, alt, caption, resolveAssetUrl }, ref) => {
  const [isLoading, setIsLoading] = React.useState(true)
  const resolvedSrc = src && resolveAssetUrl ? resolveAssetUrl(src) : src

  return (
    <div
      ref={ref}
      className="my-6 overflow-hidden rounded-xl border bg-muted/30 flex flex-col group relative text-left font-sans shadow-sm"
    >
      {resolvedSrc ? (
        <div className="relative">
          <img
            src={resolvedSrc}
            alt={alt || ""}
            className={cn(
              "w-full h-auto block transition-opacity duration-300",
              isLoading ? "opacity-0" : "opacity-100",
            )}
            onLoad={() => setIsLoading(false)}
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/20 animate-pulse">
              <Info className="h-6 w-6 text-muted-foreground/30" />
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-video flex items-center justify-center">
          <div className="text-muted-foreground flex flex-col items-center gap-2">
            <Info className="h-8 w-8 opacity-20" />
            <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">No Source</span>
          </div>
        </div>
      )}
      {caption && (
        <div className="p-3 bg-muted/20 border-t text-[11px] text-muted-foreground text-center italic">{caption}</div>
      )}
    </div>
  )
})
DocsImage.displayName = "DocsImage"

/**
 * DocsVideo - Embed a video (YouTube, Vimeo, or direct URL).
 * Uses the shared video parser so Studio and preview runtimes stay consistent.
 */
export const DocsVideo = React.forwardRef<
  HTMLDivElement,
  { src: string; title?: string; resolveAssetUrl?: (path: string) => string }
>(({ src, title, resolveAssetUrl }, ref) => {
  const resolvedSrc = src && resolveAssetUrl ? resolveAssetUrl(src) : src
  const videoInfo = resolvedSrc ? getVideoInfo(resolvedSrc) : null
  const hasVideo = Boolean(videoInfo?.isValid && videoInfo.embedUrl)

  return (
    <div
      ref={ref}
      className="my-6 relative aspect-video overflow-hidden rounded-xl border bg-foreground text-background flex items-center justify-center text-left font-sans shadow-lg"
    >
      {hasVideo ? (
        videoInfo?.provider === "direct" ? (
          // biome-ignore lint/a11y/useMediaCaption: DocsVideo renders arbitrary user media URLs and cannot infer a matching caption track.
          <video src={videoInfo.embedUrl} controls className="h-full w-full bg-black" />
        ) : (
          <iframe
            src={videoInfo?.embedUrl}
            title={title || "Documentation Video"}
            className="w-full h-full border-0"
            allow={
              videoInfo?.provider === "vimeo"
                ? "autoplay; fullscreen; picture-in-picture"
                : "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            }
            allowFullScreen
          />
        )
      ) : (
        <div className="flex flex-col items-center gap-2 text-background/60">
          <div className="size-12 rounded-full border-2 border-background/20 bg-background/5 flex items-center justify-center">
            <div className="ml-1 size-0 border-t-[8px] border-t-transparent border-l-[12px] border-l-background/70 border-b-[8px] border-b-transparent" />
          </div>
          <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">
            Video: {title || "No Source"}
          </span>
        </div>
      )}
    </div>
  )
})
DocsVideo.displayName = "DocsVideo"

/**
 * Callout - Display an informational or warning callout.
 */
export const Callout = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; type?: "info" | "warning" | "success" | "error" }
>(({ children, type = "info" }, ref) => {
  const styles = {
    info: "border-blue-500/20 bg-blue-500/10",
    warning: "border-amber-500/20 bg-amber-500/10",
    success: "border-green-500/20 bg-green-500/10",
    error: "border-red-500/20 bg-red-500/10",
  }

  return (
    <div ref={ref} className={cn("my-4 p-4 border rounded-lg text-sm text-left font-sans", styles[type])}>
      {children}
    </div>
  )
})
Callout.displayName = "Callout"
