import * as React from "react"
import { format } from "date-fns"

// A dummy component for testing
export function DocsImage({ src, alt }: { src: string; alt?: string }) {
  return (
    <div className="my-4 border rounded-lg overflow-hidden border-border bg-muted/20">
      <div className="p-2 bg-muted border-b border-border text-xs text-muted-foreground font-mono">
        Image Component: {src}
      </div>
      <div className="p-4 flex justify-center text-center text-muted-foreground">{alt || "No alt text provided"}</div>
    </div>
  )
}

export function Callout({ children, type = "info" }: { children: React.ReactNode; type?: "info" | "warning" }) {
  const bg = type === "warning" ? "bg-amber-500/10 border-amber-500/20" : "bg-blue-500/10 border-blue-500/20"
  return (
    <div className={`my-4 p-4 border rounded-md ${bg}`}>
      <strong>{type.toUpperCase()}:</strong> {children}
    </div>
  )
}

export const adapter = {
  components: {
    DocsImage,
    Callout,
  },
  scope: {
    DOCS_SETUP_MEDIA: "setup_media_v1.png",
    currentYear: new Date().getFullYear(),
    formatDate: (d: Date) => d.toISOString().split("T")[0],
  },
  allowImports: {
    "@/components/image": { DocsImage },
    "@/components/callout": { Callout, default: Callout },
    "date-fns": { format },
  },
}
