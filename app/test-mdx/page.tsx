"use client"

import { useState } from "react"
import { PreviewRuntime } from "@/components/mdx-runtime/PreviewRuntime"

const DEFAULT_MDX = `import { DocsImage } from "@/components/image"
import { Callout } from "@/components/callout"
import { format } from "date-fns"

# Minimal MDX Prototype

This tests our config-less, backend-less \`@mdx-js/mdx\` compiler pipeline.

## 1. Allowed Component Imports
<Callout type="info">
  Imports are rewritten! This Callout was "imported" using AST manipulation.
</Callout>

<DocsImage src={DOCS_SETUP_MEDIA} alt="Injected from scope" />

## 2. Allowed Function Imports
The current date is **{format(new Date(), "yyyy-MM-dd")}** (using imported \`format\`).

## 3. Scope Expressions
Current year is **{currentYear}**.
Formatted: **{formatDate(new Date())}**

---
Try typing invalid imports or making syntax errors to see the error boundary catch it!
`

export default function TestMdxPage() {
  const [source, setSource] = useState(DEFAULT_MDX)

  return (
    <div className="h-screen w-full flex flex-col p-4 bg-background">
      <h1 className="text-xl font-bold mb-4">Phase -1: Minimal MDX Runtime Prototype</h1>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Editor Pane */}
        <div className="flex-1 flex flex-col border rounded-lg bg-card">
          <div className="p-2 border-b bg-muted/50 font-mono text-sm text-muted-foreground">Editor</div>
          <textarea
            className="flex-1 p-4 font-mono text-sm bg-transparent resize-none focus:outline-none"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
          />
        </div>

        {/* Preview Pane */}
        <div className="flex-1 flex flex-col border rounded-lg bg-card overflow-hidden">
          <div className="p-2 border-b bg-muted/50 font-mono text-sm text-muted-foreground">Live Preview</div>
          <div className="flex-1 p-4 overflow-auto prose prose-sm dark:prose-invert">
            <PreviewRuntime source={source} />
          </div>
        </div>
      </div>
    </div>
  )
}
