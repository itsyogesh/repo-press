import * as React from "react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { FileTreeNode } from "@/lib/github"
import type { OverlayTreeNode } from "@/lib/explorer-tree-overlay"
import { FileRenameInput } from "./file-rename-input"
import { FileContextMenu } from "./file-context-menu"

export interface TreeItemProps {
  node: FileTreeNode
  depth: number
  onSelect: (node: FileTreeNode) => void
  selectedPath?: string
  titleMap?: Record<string, string>
  onCreateFile?: (parentPath: string) => void
  onDeleteFile?: (filePath: string, sha: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
  owner?: string
  repo?: string
}

export function TreeItem({
  node,
  depth,
  onSelect,
  selectedPath,
  titleMap,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  owner,
  repo,
}: TreeItemProps) {
  const [isOpen, setIsOpen] = React.useState(depth < 2)
  const [isRenaming, setIsRenaming] = React.useState(false)

  const overlay = node as OverlayTreeNode
  const isNew = overlay.isNew
  const isDeleted = overlay.isDeleted
  
  const displayTitle = titleMap?.[node.path]

  // Drag and Drop (Files only, Folders can be dropped into)
  const isDraggable = node.type === "file" && !isDeleted
  const isDroppable = node.type === "dir" && !isDeleted

  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `file:${node.path}`,
    data: { type: "file", node },
    disabled: !isDraggable,
  })

  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: `dir:${node.path}`,
    data: { type: "dir", node },
    disabled: !isDroppable,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
  }

  // Double click handler for rename
  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isDeleted && onRenameFile) {
      setIsRenaming(true)
    }
  }, [isDeleted, onRenameFile])

  // Context menu handlers
  const handleOpen = () => onSelect(node)
  const handleRename = () => setIsRenaming(true)
  const handleDelete = () => onDeleteFile && onDeleteFile(node.path, node.sha)
  const handleNewFile = () => onCreateFile && onCreateFile(node.type === "dir" ? node.path : (node.path.split('/').slice(0, -1).join('/')))
  
  const nodeUrl = owner && repo ? `https://github.com/${owner}/${repo}/blob/main/${node.path}` : undefined

  if (node.type === "dir") {
    return (
      <div ref={setDroppableRef}>
        <FileContextMenu
          type="folder"
          nodePath={node.path}
          onNewFile={handleNewFile}
          onCollapseAll={() => setIsOpen(false)}
          disabled={isDeleted}
        >
          <div
            className={cn(
              "group relative flex items-center w-full justify-start gap-1 py-1 px-1 h-8 font-normal rounded-md hover:bg-studio-canvas-inset transition-colors select-none text-studio-fg",
              isDeleted && "opacity-50",
              isOver && "bg-studio-accent/20 ring-1 ring-studio-accent"
            )}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(!isOpen)
            }}
          >
            {/* Indentation guides */}
            {Array.from({ length: depth }).map((_, i) => (
              <div
                key={i}
                className="absolute w-px h-full bg-studio-border-muted"
                style={{ left: `${i * 12 + 10}px` }}
              />
            ))}

            <div className="flex items-center gap-1 overflow-hidden flex-1 px-1 cursor-pointer">
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-studio-fg-muted" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-studio-fg-muted" />
              )}
              {isOpen ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-studio-accent" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-studio-accent" />
              )}
              
              {isRenaming ? (
                 <FileRenameInput
                   initialValue={node.name}
                   onSubmit={(newName) => {
                     setIsRenaming(false)
                     if (onRenameFile && newName !== node.name) {
                       const parentPath = node.path.split('/').slice(0, -1).join('/')
                       const newPath = parentPath ? `${parentPath}/${newName}` : newName
                       onRenameFile(node.path, newPath)
                     }
                   }}
                   onCancel={() => setIsRenaming(false)}
                 />
              ) : (
                <span className={cn("truncate text-[13px] leading-tight", isDeleted && "line-through text-studio-fg-muted")}>
                  {node.name}
                </span>
              )}

              {isNew && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px] bg-studio-success-muted text-studio-success border-0">
                  NEW
                </Badge>
              )}
            </div>
          </div>
        </FileContextMenu>
        {isOpen && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                onSelect={onSelect}
                selectedPath={selectedPath}
                titleMap={titleMap}
                onCreateFile={onCreateFile}
                onDeleteFile={onDeleteFile}
                onRenameFile={onRenameFile}
                owner={owner}
                repo={repo}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const isSelected = selectedPath === node.path

  return (
    <div
      ref={setDraggableRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("relative outline-none", isDragging && "opacity-50 z-50 pointer-events-none")}
    >
      <FileContextMenu
        type="file"
        nodePath={node.path}
        nodeUrl={nodeUrl}
        onOpen={handleOpen}
        onRename={handleRename}
        onDelete={handleDelete}
        disabled={isDeleted}
      >
        <div
          className={cn(
            "group relative flex items-center w-full justify-start gap-1 p-1 font-normal rounded-md transition-colors select-none text-studio-fg",
            displayTitle ? "h-auto min-h-[32px] py-1" : "h-8",
            isSelected ? "bg-studio-accent-muted border-l-2 border-studio-accent pl-[3px]" : "hover:bg-studio-canvas-inset pl-1",
            isDeleted && "opacity-50",
          )}
          style={{ paddingLeft: isSelected ? `${depth * 12 + 19}px` : `${depth * 12 + 22}px` }}
          onClick={(e) => {
            e.stopPropagation()
            if (!isDeleted) onSelect(node)
          }}
          onDoubleClick={handleDoubleClick}
          title={node.name}
        >
          {/* Indentation guides */}
          {Array.from({ length: depth }).map((_, i) => (
            <div
              key={i}
              className="absolute w-px h-full bg-studio-border-muted"
              style={{ left: `${i * 12 + 10}px` }}
            />
          ))}

          <div className="flex items-center gap-1.5 overflow-hidden flex-1 px-1 cursor-pointer">
            <File
              className={cn(
                "h-4 w-4 shrink-0",
                isNew ? "text-studio-success" : isDeleted ? "text-studio-danger" : "text-studio-fg-muted",
              )}
            />
            {isRenaming ? (
               <FileRenameInput
                 initialValue={node.name}
                 onSubmit={(newName) => {
                   setIsRenaming(false)
                   if (onRenameFile && newName !== node.name) {
                     const parentPath = node.path.split('/').slice(0, -1).join('/')
                     const newPath = parentPath ? `${parentPath}/${newName}` : newName
                     onRenameFile(node.path, newPath)
                   }
                 }}
                 onCancel={() => setIsRenaming(false)}
                 className="flex-1"
               />
            ) : (
              <div className="flex flex-col overflow-hidden">
                <span className={cn("truncate text-[13px] leading-tight", isDeleted && "line-through text-studio-fg-muted", isSelected && "font-medium")}>
                  {displayTitle || node.name}
                </span>
                {displayTitle && (
                  <span className={cn("truncate text-[10px] text-studio-fg-muted", isDeleted && "line-through")}>
                    {node.name}
                  </span>
                )}
              </div>
            )}
            {isNew && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px] bg-studio-success-muted text-studio-success border-0 shrink-0">
                NEW
              </Badge>
            )}
          </div>
        </div>
      </FileContextMenu>
    </div>
  )
}
