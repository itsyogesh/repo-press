"use client"

import { insertJsx$, usePublisher } from "@mdxeditor/editor"
import { Box, Plus } from "lucide-react"
import * as React from "react"
import { buildEditorInsertOperation } from "@/lib/studio/component-insert-operation"
import type { ComponentNode } from "@/lib/studio/component-node"
import type { RepoComponentDef } from "@/lib/studio/component-registry"
import { ComponentInsertModal } from "./component-insert-modal"
import { useStudioAdapter } from "./studio-adapter-context"

interface InsertJsxButtonProps {
  owner: string
  repo: string
  branch: string
  projectId?: string
  userId?: string
}

export function InsertJsxButton({ owner, repo, branch, projectId, userId }: InsertJsxButtonProps) {
  const { components: schema, adapter } = useStudioAdapter()
  const insertJsx = usePublisher(insertJsx$)
  const [modalOpen, setModalOpen] = React.useState(false)

  const hasComponents = React.useMemo(() => {
    const adapterCount = Object.keys(adapter?.components || {}).length
    const schemaCount = Object.keys(schema || {}).length
    return adapterCount + schemaCount > 0
  }, [adapter, schema])

  if (!hasComponents) return null

  const handleInsert = (_jsx: string, def: RepoComponentDef, node: ComponentNode) => {
    const operation = buildEditorInsertOperation(def, node)
    insertJsx(operation.payload)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium hover:bg-studio-canvas-inset transition-colors"
        title="Insert component"
      >
        <Box className="h-3.5 w-3.5" />
        <span>JSX</span>
        <Plus className="h-3 w-3 opacity-50" />
      </button>

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
