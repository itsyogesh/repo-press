"use client"

import { DiffEditor } from "@monaco-editor/react"
import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"

interface DiffViewerProps {
  originalValue: string
  modifiedValue: string
  language?: string
  className?: string
}

export function DiffViewer({ originalValue, modifiedValue, language = "markdown", className }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<"split" | "inline">("split")

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
          theme="vs-dark"
        />
      </div>
    </div>
  )
}
