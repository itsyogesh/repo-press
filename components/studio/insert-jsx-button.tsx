"use client"

import { insertJsx$, usePublisher } from "@mdxeditor/editor"
import { Plus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AuthoringComponent } from "@/lib/studio/authoring-catalog"
import { buildEditorInsertOperation } from "@/lib/studio/component-insert-operation"
import type { ComponentNode } from "@/lib/studio/component-node"
import { ComponentInsertModal } from "./component-insert-modal"
import { useStudioAdapter } from "./studio-adapter-context"
import { useInsertComponentModal } from "./studio-layout"

interface InsertJsxButtonProps {
  owner: string
  repo: string
  branch: string
  projectId?: string
  userId?: string
  selectedFilePath?: string
}

export function InsertJsxButton({ owner, repo, branch, projectId, userId, selectedFilePath }: InsertJsxButtonProps) {
  const { authoringCatalog } = useStudioAdapter()
  const insertJsx = usePublisher(insertJsx$)
  const [modalOpen, setModalOpen] = React.useState(false)
  const insertComponentModalCtx = useInsertComponentModal()

  // Use controlled state from context (⌘J shortcut) when available,
  // otherwise fall back to local state (toolbar button click).
  const effectiveOpen = insertComponentModalCtx?.open ?? modalOpen
  const handleOpenChange = (open: boolean) => {
    setModalOpen(open)
    insertComponentModalCtx?.setOpen(open)
  }

  if (authoringCatalog.length === 0) return null

  const handleInsert = (_jsx: string, def: AuthoringComponent, node: ComponentNode) => {
    try {
      const operation = buildEditorInsertOperation(def, node)
      insertJsx(operation.payload)
      toast.success(`${def.displayName} inserted`)
    } catch (error) {
      console.error("Error inserting JSX:", error)
      toast.error("Failed to insert component")
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(true)}
            className="h-7 gap-1.5 px-2.5 text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Insert
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>
            Insert component <kbd className="ml-1 text-xs opacity-60">⌘J</kbd>
          </p>
        </TooltipContent>
      </Tooltip>

      <ComponentInsertModal
        open={effectiveOpen}
        onOpenChange={handleOpenChange}
        authoringCatalog={authoringCatalog}
        repoContext={projectId ? { projectId, userId, owner, repo, branch, selectedFilePath } : undefined}
        onInsert={handleInsert}
      />
    </>
  )
}
