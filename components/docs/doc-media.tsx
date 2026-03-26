import type * as React from "react"

/**
 * DocsImage — Display an image with optional alt text.
 * Props: src (string), alt (string, optional), caption (string, optional)
 */
export function DocsImage({ src, alt, caption }: { src: string; alt?: string; caption?: string }) {
  return (
    <figure className="my-4">
      <img src={src} alt={alt || ""} className="w-full rounded-lg border border-border" />
      {caption && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption>}
    </figure>
  )
}

/**
 * DocsVideo — Embed a video (YouTube, Vimeo, or direct URL).
 * Automatically converts youtu.be short URLs to embed URLs.
 * Props: src (string), title (string, optional)
 */
export function DocsVideo({ src, title }: { src: string; title?: string }) {
  let resolvedSrc = src
  if (src?.includes("youtu.be/")) {
    const id = src.split("youtu.be/")[1]?.split("?")[0]
    if (id) resolvedSrc = `https://www.youtube.com/embed/${id}`
  }

  return (
    <div className="my-6 relative aspect-video overflow-hidden rounded-lg border border-border bg-muted">
      <iframe
        src={resolvedSrc}
        title={title || "Video"}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}

/**
 * Callout — Display an informational or warning callout.
 * Props: children (React.ReactNode), type ("info" | "warning", default: "info")
 */
export function Callout({ children, type = "info" }: { children: React.ReactNode; type?: "info" | "warning" }) {
  const bg = type === "warning" ? "bg-amber-500/10 border-amber-500/20" : "bg-blue-500/10 border-blue-500/20"
  const icon = type === "warning" ? "⚠️" : "ℹ️"

  return (
    <div className={`my-4 p-4 border rounded-md ${bg}`}>
      <strong>
        {icon} {type.toUpperCase()}:
      </strong>
      {children}
    </div>
  )
}
