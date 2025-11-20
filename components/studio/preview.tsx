"use client"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ScrollArea } from "@/components/ui/scroll-area"

interface PreviewProps {
  content: string
  frontmatter: Record<string, any>
}

export function Preview({ content, frontmatter }: PreviewProps) {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      <div className="p-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</div>
      <ScrollArea className="flex-1">
        <div className="p-8 prose dark:prose-invert max-w-none">
          {frontmatter.title && <h1>{frontmatter.title}</h1>}
          {frontmatter.date && (
            <p className="text-muted-foreground text-sm">{new Date(frontmatter.date).toLocaleDateString()}</p>
          )}
          {frontmatter.coverImage && (
            <img
              src={frontmatter.coverImage || "/placeholder.svg"}
              alt={frontmatter.title}
              className="rounded-lg w-full object-cover aspect-video mb-8"
            />
          )}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </ScrollArea>
    </div>
  )
}
