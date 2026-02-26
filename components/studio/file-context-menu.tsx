import * as React from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

export type ContextMenuType = "file" | "folder" | "background"

interface FileContextMenuProps {
  children: React.ReactNode
  type: ContextMenuType
  nodePath?: string
  nodeUrl?: string
  onOpen?: () => void
  onRename?: () => void
  onDelete?: () => void
  onNewFile?: () => void
  onRefresh?: () => void
  onCollapseAll?: () => void
  disabled?: boolean
}

export function FileContextMenu({
  children,
  type,
  nodePath,
  nodeUrl,
  onOpen,
  onRename,
  onDelete,
  onNewFile,
  onRefresh,
  onCollapseAll,
  disabled
}: FileContextMenuProps) {
  if (disabled) return <>{children}</>

  const copyPath = () => {
    if (nodePath) {
      navigator.clipboard.writeText(nodePath)
    }
  }

  const copyUrl = () => {
    if (nodeUrl) {
      navigator.clipboard.writeText(nodeUrl)
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {type === "file" && (
          <>
            <ContextMenuItem onClick={onOpen}>Open</ContextMenuItem>
            <ContextMenuItem onClick={onRename}>
              Rename <span className="ml-auto text-xs text-muted-foreground">F2</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={onDelete} className="text-studio-danger focus:text-studio-danger">
              Delete...
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={copyPath}>Copy path</ContextMenuItem>
            {nodeUrl && <ContextMenuItem onClick={copyUrl}>Copy GitHub URL</ContextMenuItem>}
          </>
        )}

        {type === "folder" && (
          <>
            <ContextMenuItem onClick={onNewFile}>New file here...</ContextMenuItem>
            <ContextMenuItem onClick={onCollapseAll}>Collapse all</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={copyPath}>Copy path</ContextMenuItem>
          </>
        )}

        {type === "background" && (
          <>
            <ContextMenuItem onClick={onNewFile}>New file...</ContextMenuItem>
            <ContextMenuItem onClick={onRefresh}>Refresh tree</ContextMenuItem>
            <ContextMenuItem onClick={onCollapseAll}>Collapse all</ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
