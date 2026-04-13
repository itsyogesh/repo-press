"use client"

import { DiffEditor } from "@monaco-editor/react"
import { Loader2 } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"

interface DiffViewerProps {
  originalValue: string
  modifiedValue: string
  language?: string
  className?: string
}

export function DiffViewer({ originalValue, modifiedValue, language = "markdown", className }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<"split" | "inline">("split")
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const monacoTheme = mounted && resolvedTheme === "light" ? "light" : "vs-dark"

  const options = useMemo(
    () => ({
      renderSideBySide: viewMode === "split",
      originalEditable: false,
      readOnly: true,
      ignoreTrimWhitespace: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: true,
      diffWordWrap: "off" as const,
    }),
    [viewMode],
  )

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex rounded-md border bg-muted p-1">
          <button
            type="button"
            onClick={() => setViewMode("split")}
            className={cn(
              "px-3 py-1 text-sm rounded-sm transition-colors",
              viewMode === "split" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Split
          </button>
          <button
            type="button"
            onClick={() => setViewMode("inline")}
            className={cn(
              "px-3 py-1 text-sm rounded-sm transition-colors",
              viewMode === "inline" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Inline
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-[400px] border rounded-lg overflow-hidden">
        <DiffEditor
          original={originalValue}
          modified={modifiedValue}
          language={language}
          options={options}
          theme={monacoTheme}
          loading={
            <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading diff editor…</span>
            </div>
          }
        />
      </div>
    </div>
  )
}
