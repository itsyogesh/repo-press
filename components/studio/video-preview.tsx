"use client"

import { AlertCircle, Play } from "lucide-react"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getVideoInfo } from "@/lib/studio/video-embed"
import { cn } from "@/lib/utils"

interface VideoPreviewProps {
  /** Video URL to preview */
  url: string
  /** Optional CSS class */
  className?: string
}

/**
 * VideoPreview — Shows embedded video or helpful message.
 *
 * Detects video provider (YouTube, Vimeo, direct URLs) and renders:
 * - Embedded iframe for YouTube/Vimeo
 * - HTML5 <video> for direct URLs
 * - Help message for invalid URLs
 */
export function VideoPreview({ url, className }: VideoPreviewProps) {
  const videoInfo = getVideoInfo(url)

  if (!videoInfo.isValid) {
    if (!url.trim()) {
      return (
        <div
          className={cn(
            "flex items-center justify-center h-32 rounded-lg border-2 border-dashed border-studio-border bg-studio-canvas-inset",
            className,
          )}
        >
          <div className="text-center">
            <Play className="h-8 w-8 mx-auto mb-2 text-studio-fg-muted opacity-40" />
            <p className="text-sm text-studio-fg-muted">Enter a video URL to preview</p>
          </div>
        </div>
      )
    }

    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Invalid video URL. Try YouTube, Vimeo, or a direct link to MP4/WebM.</AlertDescription>
      </Alert>
    )
  }

  // YouTube embed
  if (videoInfo.provider === "youtube") {
    return (
      <div className={cn("rounded-lg overflow-hidden border border-studio-border", className)}>
        <iframe
          src={videoInfo.embedUrl}
          title="YouTube video player"
          className="w-full aspect-video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    )
  }

  // Vimeo embed
  if (videoInfo.provider === "vimeo") {
    return (
      <div className={cn("rounded-lg overflow-hidden border border-studio-border", className)}>
        <iframe
          src={videoInfo.embedUrl}
          className="w-full aspect-video"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  // Direct video file
  if (videoInfo.provider === "direct") {
    return (
      <div className={cn("rounded-lg overflow-hidden border border-studio-border bg-black", className)}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={videoInfo.embedUrl} controls className="w-full h-auto" style={{ maxHeight: "400px" }} />
      </div>
    )
  }

  return null
}
