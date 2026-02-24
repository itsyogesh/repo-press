"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"
import remarkGfm from "remark-gfm"
import { buildGitHubRawUrl, resolveFieldValue } from "@/lib/framework-adapters"
import type { FieldVariantMap } from "@/lib/framework-adapters"
import { cn } from "@/lib/utils"

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
function MdxComponentPlaceholder({ name, children, ...props }: { name: string; children?: React.ReactNode } & Record<string, any>) {
  const propsDisplay = Object.entries(props)
    .filter(([k]) => k !== "node")
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ")

  return (
    <div className="my-4 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/30 p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 font-mono text-xs text-blue-700 dark:text-blue-300">
          {"<"}{name}{propsDisplay ? ` ${propsDisplay}` : ""}{children ? ">" : " />"}
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
}

export function Preview({ content, frontmatter, fieldVariants, owner, repo, branch, scrollContainerRef, onScroll }: PreviewProps) {
  const title = resolveFieldValue(frontmatter, "title", fieldVariants) as string | undefined
  const date = resolveFieldValue(frontmatter, "date", fieldVariants) as string | undefined
  const rawImage = resolveFieldValue(frontmatter, "image", fieldVariants) as string | undefined
  const description = resolveFieldValue(frontmatter, "description", fieldVariants) as string | undefined

  const image = rawImage ? buildGitHubRawUrl(rawImage, owner, repo, branch) : undefined
  const [imageError, setImageError] = React.useState(false)

  // Reset image error when image URL changes
  React.useEffect(() => {
    setImageError(false)
  }, [image])

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="p-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">
        Preview
      </div>
      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto"
      >
        <article className={cn("p-8 prose prose-neutral dark:prose-invert max-w-none", "prose-headings:scroll-mt-4")}>
          {title && <h1>{title}</h1>}
          {date && (
            <p className="text-muted-foreground text-sm not-prose">
              {new Date(date).toLocaleDateString()}
            </p>
          )}
          {description && (
            <p className="text-muted-foreground text-sm not-prose italic mt-1">
              {description}
            </p>
          )}
          {image && !imageError && (
            <img
              src={image}
              alt={title}
              className="rounded-lg w-full object-cover aspect-video mb-8"
              onError={() => setImageError(true)}
            />
          )}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={MDX_COMPONENTS}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  )
}
