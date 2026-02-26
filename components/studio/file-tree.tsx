"use client"

import * as React from "react"
import { Plus, RefreshCw, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"

import { filterTree } from "@/lib/explorer-tree-overlay"
import type { OverlayTreeNode } from "@/lib/explorer-tree-overlay"
import type { FileTreeNode } from "@/lib/github"
import { cn } from "@/lib/utils"

import { TreeItem } from "./file-tree-item"
import { FileContextMenu } from "./file-context-menu"

interface FileTreeProps {
  tree: FileTreeNode[]
  onSelect: (node: FileTreeNode) => void
  selectedPath?: string
  titleMap?: Record<string, string>
  onCreateFile?: (parentPath: string) => void
  onDeleteFile?: (filePath: string, sha: string) => void
  onUndoDelete?: (filePath: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
  onMoveFile?: (oldPath: string, newParentPath: string) => void
  owner?: string
  repo?: string
}

export function FileTree({
  tree,
  onSelect,
  selectedPath,
  titleMap,
  onCreateFile,
  onDeleteFile,
  onUndoDelete,
  onRenameFile,
  onMoveFile,
  owner,
  repo,
}: FileTreeProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const displayTree = React.useMemo(
    () => (searchQuery ? filterTree(tree as OverlayTreeNode[], searchQuery, titleMap) : tree),
    [tree, searchQuery, titleMap],
  )

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        if (e.key === "Escape" && e.target === searchInputRef.current) {
          e.preventDefault()
          setSearchQuery("")
          ;(e.target as HTMLInputElement).blur()
        }
        return
      }

      if (e.key === "/") {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event

    if (over && active.id !== over.id) {
      if (onMoveFile) {
        const activeNode = active.data.current?.node as FileTreeNode
        const overNode = over.data.current?.node as FileTreeNode

        if (activeNode && overNode && overNode.type === "dir") {
          onMoveFile(activeNode.path, overNode.path)
        }
      }
    }
  }

  const handleCreateRootFile = () => {
    if (onCreateFile) {
      onCreateFile("")
    }
  }

  // Count files recursively
  const getFileCount = (nodes: FileTreeNode[]): number => {
    return nodes.reduce((acc, node) => {
      if (node.type === "file") return acc + 1
      if (node.children) return acc + getFileCount(node.children)
      return acc
    }, 0)
  }

  const totalFiles = React.useMemo(() => getFileCount(tree), [tree])

  return (
    <div className="h-full flex flex-col bg-studio-canvas text-studio-fg text-sm">
      <div className="p-2 border-b border-studio-border text-xs font-semibold text-studio-fg uppercase tracking-wider flex items-center justify-between sticky top-0 bg-studio-canvas z-10">
        <span>Explorer ({totalFiles})</span>
        <div className="flex items-center gap-1">
          {onCreateFile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md hover:bg-studio-canvas-inset"
              onClick={handleCreateRootFile}
              title="New file"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md hover:bg-studio-canvas-inset"
            title="Refresh"
            onClick={() => {
              // Refresh is handled by mutating the tree upstream, but we can clear search
              setSearchQuery("")
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="p-2 border-b border-studio-border bg-studio-canvas z-10 sticky top-10">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-studio-fg-muted" />
          <Input
            ref={searchInputRef}
            placeholder="Search files... [/]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 w-full pl-8 pr-7 text-xs bg-studio-canvas border-studio-border focus-visible:ring-1 focus-visible:ring-studio-accent rounded-md shadow-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-2 text-studio-fg-muted hover:text-studio-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {displayTree.length === 0 ? (
            <div className="text-xs text-studio-fg-muted p-4 text-center">
              {searchQuery ? "No matching files" : "No folders or files"}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <FileContextMenu
                type="background"
                onNewFile={handleCreateRootFile}
                onRefresh={() => setSearchQuery("")}
                onCollapseAll={() => {
                  // Handled upstream or by generic collapse
                }}
              >
                <div className="min-h-[200px]">
                  {displayTree.map((node) => (
                    <TreeItem
                      key={node.path}
                      node={node}
                      depth={0}
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
              </FileContextMenu>

              <DragOverlay>
                {activeId ? (
                  <div className="opacity-80 scale-105 pointer-events-none p-2 bg-studio-canvas border border-studio-border rounded-md shadow-lg text-sm flex items-center">
                    Dragging {activeId.replace("file:", "")}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  )
}
