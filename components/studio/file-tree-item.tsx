import { useDraggable, useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDown, ChevronRight, File, Folder, FolderOpen, Plus, Undo2 } from "lucide-react"
import * as React from "react"
import { Badge } from "@/components/ui/badge"
import type { OverlayTreeNode } from "@/lib/explorer-tree-overlay"
import type { FileTreeNode } from "@/lib/github"
import { cn } from "@/lib/utils"
import { FileContextMenu } from "./file-context-menu"
import { FileRenameInput } from "./file-rename-input"

const TREE_INDENT_PX = 10
const TREE_BASE_OFFSET_PX = 4
const TREE_GUIDE_OFFSET_PX = 9

export interface TreeItemProps {
  node: FileTreeNode
  depth: number
  expandedDirs: Set<string>
  focusedPath?: string | null
  renamingPath?: string | null
  onSelect: (node: FileTreeNode) => void
  onFocusPath: (path: string) => void
  onToggleDir: (path: string) => void
  onStartRename: (path: string) => void
  onCancelRename: () => void
  onCollapseAll?: () => void
  selectedPath?: string
  titleMap?: Record<string, string>
  onCreateFile?: (parentPath: string) => void
  onDeleteFile?: (filePath: string, sha: string) => void
  onUndoDelete?: (filePath: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
  owner?: string
  repo?: string
}

export function TreeItem({
  node,
  depth,
  expandedDirs,
  focusedPath,
  renamingPath,
  onSelect,
  onFocusPath,
  onToggleDir,
  onStartRename,
  onCancelRename,
  onCollapseAll,
  selectedPath,
  titleMap,
  onCreateFile,
  onDeleteFile,
  onUndoDelete,
  onRenameFile,
  owner,
  repo,
}: TreeItemProps) {
  const overlay = node as OverlayTreeNode
  const isNew = overlay.isNew
  const isDeleted = overlay.isDeleted
  const isOpen = node.type === "dir" ? expandedDirs.has(node.path) : false
  const isRenaming = renamingPath === node.path

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
  const draggableProps = isDraggable ? { ...attributes, ...listeners } : {}

  const handleRenameSubmit = React.useCallback(
    (newName: string) => {
      onCancelRename()
      if (!onRenameFile || newName === node.name) return
      const parentPath = node.path.split("/").slice(0, -1).join("/")
      const newPath = parentPath ? `${parentPath}/${newName}` : newName
      onRenameFile(node.path, newPath)
    },
    [onCancelRename, onRenameFile, node.path, node.name],
  )

  // Context menu handlers
  const handleOpen = () => onSelect(node)
  const handleRename = () => onStartRename(node.path)
  const handleDelete = () => onDeleteFile?.(node.path, node.sha)
  const handleUndoDelete = () => onUndoDelete?.(node.path)
  const handleNewFile = () =>
    onCreateFile?.(node.type === "dir" ? node.path : node.path.split("/").slice(0, -1).join("/"))

  const nodeUrl = owner && repo ? `https://github.com/${owner}/${repo}/blob/main/${node.path}` : undefined

  if (node.type === "dir") {
    return (
      <div ref={setDroppableRef}>
        <FileContextMenu
          type="folder"
          nodePath={node.path}
          onNewFile={handleNewFile}
          onCollapseAll={onCollapseAll}
          disabled={isDeleted}
        >
          <div className="group relative">
            <div
              role="button"
              tabIndex={0}
              className={cn(
                "relative flex h-8 w-full select-none items-center justify-start gap-1 rounded-md px-1 py-1 pr-8 font-normal text-studio-fg transition-[background-color,box-shadow,color] duration-150 hover:bg-studio-canvas-inset focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-studio-accent/60",
                isDeleted && "opacity-50",
                focusedPath === node.path && "ring-1 ring-studio-accent/50",
                isOver && "bg-studio-accent/20 ring-1 ring-studio-accent",
              )}
              style={{ paddingLeft: `${depth * TREE_INDENT_PX + TREE_BASE_OFFSET_PX}px` }}
              onClick={(e) => {
                e.stopPropagation()
                onFocusPath(node.path)
                onToggleDir(node.path)
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return
                e.preventDefault()
                e.stopPropagation()
                onFocusPath(node.path)
                onToggleDir(node.path)
              }}
            >
              {/* Indentation guides */}
              {Array.from({ length: depth }).map((_, i) => (
                <div
                  key={`${node.path}-folder-guide-${i}`}
                  className="absolute w-px h-full bg-studio-border-muted"
                  style={{ left: `${i * TREE_INDENT_PX + TREE_GUIDE_OFFSET_PX}px` }}
                />
              ))}

              <div className="flex items-center gap-1 overflow-hidden flex-1 cursor-pointer">
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
                  <FileRenameInput initialValue={node.name} onSubmit={handleRenameSubmit} onCancel={onCancelRename} />
                ) : (
                  <span
                    className={cn("truncate text-[13px] leading-tight", isDeleted && "line-through text-studio-fg-muted")}
                  >
                    {node.name}
                  </span>
                )}

                {isNew && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4 px-1 text-[10px] bg-studio-success-muted text-studio-success border-0"
                  >
                    NEW
                  </Badge>
                )}
              </div>
            </div>
            {onCreateFile && !isDeleted && (
              <button
                type="button"
                className="absolute right-1 top-1/2 z-10 -translate-y-1/2 h-6 w-6 rounded-md text-studio-fg-muted opacity-0 transition-opacity hover:bg-studio-canvas focus-visible:opacity-100 group-hover:opacity-100"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onCreateFile(node.path)
                }}
                title={`New file in ${node.name}`}
              >
                <Plus className="mx-auto h-3.5 w-3.5" />
              </button>
            )}
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
                onUndoDelete={onUndoDelete}
                onRenameFile={onRenameFile}
                expandedDirs={expandedDirs}
                focusedPath={focusedPath}
                renamingPath={renamingPath}
                onFocusPath={onFocusPath}
                onToggleDir={onToggleDir}
                onStartRename={onStartRename}
                onCancelRename={onCancelRename}
                onCollapseAll={onCollapseAll}
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
  const isFocused = focusedPath === node.path

  return (
    <div
      ref={setDraggableRef}
      style={style}
      {...draggableProps}
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
        <div className="group relative">
          <button
            type="button"
            className={cn(
              "relative flex w-full select-none items-center justify-start gap-1 rounded-md p-1 pr-12 font-normal text-studio-fg transition-[background-color,box-shadow,color] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-studio-accent/60",
              displayTitle ? "h-auto min-h-[32px] py-1" : "h-8",
              isSelected
                ? "bg-studio-accent-muted ring-1 ring-inset ring-studio-accent/35"
                : "hover:bg-studio-canvas-inset/90",
              isFocused && !isSelected && "ring-1 ring-studio-accent/50",
              isDeleted && "opacity-50",
            )}
            style={{ paddingLeft: `${depth * TREE_INDENT_PX + TREE_BASE_OFFSET_PX}px` }}
            onClick={(e) => {
              e.stopPropagation()
              if (!isDeleted) {
                onFocusPath(node.path)
                onSelect(node)
              }
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return
              e.preventDefault()
              e.stopPropagation()
              if (!isDeleted) {
                onFocusPath(node.path)
                onSelect(node)
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (!isDeleted && onRenameFile) {
                onStartRename(node.path)
              }
            }}
            title={node.name}
          >
            {/* Indentation guides */}
            {Array.from({ length: depth }).map((_, i) => (
              <div
                key={`${node.path}-file-guide-${i}`}
                className="absolute w-px h-full bg-studio-border-muted"
                style={{ left: `${i * TREE_INDENT_PX + TREE_GUIDE_OFFSET_PX}px` }}
              />
            ))}

            <div className="flex flex-1 cursor-pointer items-center gap-1 overflow-hidden">
              <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <File
                className={cn(
                  "h-4 w-4 shrink-0",
                  isNew ? "text-studio-success" : isDeleted ? "text-studio-danger" : "text-studio-fg-muted",
                )}
              />
              {isRenaming ? (
                <FileRenameInput
                  initialValue={node.name}
                  onSubmit={handleRenameSubmit}
                  onCancel={onCancelRename}
                  className="flex-1"
                />
              ) : (
                <div className="min-w-0 flex flex-col items-start overflow-hidden text-left">
                  <span
                    className={cn(
                      "w-full truncate text-left text-[13px] leading-tight",
                      isDeleted && "line-through text-studio-fg-muted",
                      isSelected && "font-medium",
                    )}
                  >
                    {displayTitle || node.name}
                  </span>
                  {displayTitle && (
                    <span
                      className={cn("w-full truncate text-left text-[10px] text-studio-fg-muted", isDeleted && "line-through")}
                    >
                      {node.name}
                    </span>
                  )}
                </div>
              )}
              {isNew && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-4 px-1 text-[10px] bg-studio-success-muted text-studio-success border-0 shrink-0"
                >
                  NEW
                </Badge>
              )}
            </div>
          </button>
          {isDeleted && onUndoDelete && (
            <button
              type="button"
              className="absolute right-1 top-1/2 z-10 -translate-y-1/2 inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] text-studio-fg-muted opacity-0 transition-opacity hover:bg-studio-canvas focus-visible:opacity-100 group-hover:opacity-100"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleUndoDelete()
              }}
              title="Undo delete"
            >
              <Undo2 className="h-3 w-3" />
              Undo
            </button>
          )}
        </div>
      </FileContextMenu>
    </div>
  )
}
