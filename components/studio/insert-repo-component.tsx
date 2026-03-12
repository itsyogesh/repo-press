"use client"

import { insertJsx$, usePublisher, viewMode$ } from "@mdxeditor/editor"
import { useCellValue } from "@mdxeditor/gurx"
import { Box, Plus } from "lucide-react"
import * as React from "react"
import { buildEditorInsertOperation } from "@/lib/studio/component-insert-operation"
import type { ComponentNode } from "@/lib/studio/component-node"
import type { RepoComponentDef } from "@/lib/studio/component-registry"
import { ComponentInsertModal } from "./component-insert-modal"
import { useStudioAdapter } from "./studio-adapter-context"

/**
 * Toolbar button that opens the component insert modal.
 *
 * In source mode, shows a message asking the user to switch to rich-text
 * mode (source-cursor insertion is deferred per plan).
 */
export function InsertRepoComponent({
  owner,
  repo,
  branch,
  projectId,
  userId,
}: {
  owner: string
  repo: string
  branch: string
  projectId?: string
  userId?: string
}) {
  const { components: schema, adapter } = useStudioAdapter()
  const insertJsx = usePublisher(insertJsx$)
  const editorViewMode = useCellValue(viewMode$)

  const [modalOpen, setModalOpen] = React.useState(false)
  const [sourceWarning, setSourceWarning] = React.useState(false)

  // Combine component names to check if we have any
  const hasComponents = React.useMemo(() => {
    const adapterCount = Object.keys(adapter?.components || {}).length
    const schemaCount = Object.keys(schema || {}).length
    return adapterCount + schemaCount > 0
  }, [adapter, schema])

  const handleClick = React.useCallback(() => {
    // Source-mode behavior: show "switch to Rich Text" message
    if (editorViewMode === "source") {
      setSourceWarning(true)
      setTimeout(() => setSourceWarning(false), 3000)
      return
    }
    setModalOpen(true)
  }, [editorViewMode])

  /**
   * Insert callback — receives serialized JSX, def, and resolved node.
   *
   * Data flow (sync contract):
   *   form → ComponentNode → toJsxProperties → insertJsx$ → MDAST → onChange → preview
   *
   * The serialized JSX string is kept for future source-mode insertion.
   * For WYSIWYG mode, we convert the node's props to MDXEditor's
   * `JsxProperties` format and use the structured `insertJsx$` API.
   */
  const handleInsert = React.useCallback(
    (_jsx: string, def: RepoComponentDef, node: ComponentNode) => {
      const operation = buildEditorInsertOperation(def, node)
      insertJsx(operation.payload)
    },
    [insertJsx],
  )

  if (!hasComponents) return null

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={handleClick}
          className="flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium hover:bg-studio-canvas-inset transition-colors"
          title="Insert component"
        >
          <Box className="h-3.5 w-3.5" />
          <span>JSX</span>
          <Plus className="h-3 w-3 opacity-50" />
        </button>

        {/* Source-mode warning tooltip */}
        {sourceWarning && (
          <div className="absolute top-full left-0 mt-1 z-50 w-56 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
            Switch to <span className="font-semibold">Rich Text</span> mode to insert components visually.
          </div>
        )}
      </div>

      <ComponentInsertModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        adapterComponents={adapter?.components}
        projectComponents={schema}
        repoContext={projectId ? { projectId, userId, owner, repo, branch } : undefined}
        onInsert={handleInsert}
      />
    </>
  )
}
