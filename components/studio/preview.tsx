"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import { Maximize2, Minimize2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buildGitHubRawUrl, resolveFieldValue } from "@/lib/framework-adapters"
import type { FieldVariantMap } from "@/lib/framework-adapters"
import { cn } from "@/lib/utils"

import { DeviceFrame } from "./device-frame"
import { ViewportToggle, type Viewport } from "./viewport-toggle"

interface PreviewProps {
  content: string
  frontmatter: Record<string, any>
  fieldVariants?: FieldVariantMap
  owner: string
  repo: string
  branch: string
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
}

/** Styled placeholder for unresolved MDX components */
function MdxComponentPlaceholder({
  name,
  children,
  ...props
}: { name: string; children?: React.ReactNode } & Record<string, any>) {
  const propsDisplay = Object.entries(props)
    .filter(([k]) => k !== "node")
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ")

  return (
    <div className="my-4 rounded-lg border border-dashed border-studio-accent/30 bg-studio-accent-muted/50 p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-studio-accent/10 px-1.5 py-0.5 font-mono text-xs text-studio-accent">
          {"<"}
          {name}
          {propsDisplay ? ` ${propsDisplay}` : ""}
          {children ? ">" : " />"}
        </span>
      </div>
      {children && <div className="mt-2 text-sm">{children}</div>}
    </div>
  )
}

/** Create a component map entry for an MDX component name */
function mdxPlaceholder(name: string) {
  return function MdxPlaceholderWrapper(props: any) {
    return <MdxComponentPlaceholder name={name} {...props} />
  }
}

/** Known MDX component names to render as styled placeholders */
const MDX_COMPONENTS: Record<string, ReturnType<typeof mdxPlaceholder>> = {
  Callout: mdxPlaceholder("Callout"),
  DynamicImage: mdxPlaceholder("DynamicImage"),
  TickPoint: mdxPlaceholder("TickPoint"),
  Note: mdxPlaceholder("Note"),
  Warning: mdxPlaceholder("Warning"),
  Tip: mdxPlaceholder("Tip"),
  Info: mdxPlaceholder("Info"),
  Card: mdxPlaceholder("Card"),
  CardGroup: mdxPlaceholder("CardGroup"),
  Tabs: mdxPlaceholder("Tabs"),
  Tab: mdxPlaceholder("Tab"),
  Steps: mdxPlaceholder("Steps"),
  Step: mdxPlaceholder("Step"),
  Accordion: mdxPlaceholder("Accordion"),
  AccordionGroup: mdxPlaceholder("AccordionGroup"),
  CodeGroup: mdxPlaceholder("CodeGroup"),
  CodeBlock: mdxPlaceholder("CodeBlock"),
  DocsImage: mdxPlaceholder("DocsImage"),
  DocsVideo: mdxPlaceholder("DocsVideo"),
}

export function Preview({
  content,
  frontmatter,
  fieldVariants,
  owner,
  repo,
  branch,
  scrollContainerRef,
  onScroll,
}: PreviewProps) {
  const [viewport, setViewport] = React.useState<Viewport>("desktop")
  const [isFullScreen, setIsFullScreen] = React.useState(false)

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

  const image = rawImage ? buildGitHubRawUrl(rawImage, owner, repo, branch) : undefined
  const [imageError, setImageError] = React.useState(false)

  // Reset image error when image URL changes
  React.useEffect(() => {
    setImageError(false)
  }, [image])

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
    <article className={cn("p-8 prose prose-neutral dark:prose-invert max-w-none", "prose-headings:scroll-mt-4")}>
      {/* Frontmatter metadata display */}
      {(title || date || tags || author) && (
        <div className="not-prose mb-6 pb-4 border-b border-studio-border">
          {title && <h1 className="text-2xl font-bold text-studio-fg mb-1">{title}</h1>}
          <div className="flex items-center gap-3 flex-wrap mt-2">
            {date && (
              <span className="text-studio-fg-muted text-sm">
                {new Date(date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            )}
            {author && <span className="text-studio-fg-muted text-sm">by {author}</span>}
          </div>
          {tags && tags.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] bg-studio-accent-muted text-studio-accent">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {description && <p className="text-studio-fg-muted text-sm not-prose italic mt-1 mb-4">{description}</p>}

      {image && !imageError && (
        <img
          src={image}
          alt={title}
          className="rounded-lg w-full object-cover aspect-video mb-8"
          loading="lazy"
          onError={() => setImageError(true)}
        />
      )}

      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]} components={MDX_COMPONENTS}>
        {debouncedContent}
      </ReactMarkdown>
    </article>
  )

  if (isFullScreen) {
    return (
      <div className="fixed inset-0 z-50 bg-studio-canvas flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-studio-border shrink-0 bg-studio-canvas">
          <span className="text-xs font-semibold text-studio-fg uppercase tracking-wider">Preview</span>
          <div className="flex items-center gap-2">
            <ViewportToggle value={viewport} onChange={setViewport} />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsFullScreen(false)}
              title="Exit full-screen (Esc)"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <DeviceFrame viewport={viewport}>{previewContent}</DeviceFrame>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-studio-canvas">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-studio-border shrink-0">
        <span className="text-xs font-semibold text-studio-fg uppercase tracking-wider">Preview</span>
        <div className="flex items-center gap-2">
          <ViewportToggle value={viewport} onChange={setViewport} />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsFullScreen(true)}
            title="Full-screen preview"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div ref={scrollContainerRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        <DeviceFrame viewport={viewport}>{previewContent}</DeviceFrame>
      </div>
    </div>
  )
}
