"use client"

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { Plus, Search, X } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { OverlayTreeNode } from "@/lib/explorer-tree-overlay"
import { filterTree } from "@/lib/explorer-tree-overlay"
import type { FileTreeNode } from "@/lib/github"
import { FileContextMenu } from "./file-context-menu"
import { TreeItem } from "./file-tree-item"

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

type VisibleTreeItem = {
  node: FileTreeNode
  depth: number
  parentPath: string | null
}

function buildInitialExpandedDirs(nodes: FileTreeNode[], depth = 0, result = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.type !== "dir") continue
    if (depth < 2) {
      result.add(node.path)
    }
    if (node.children) {
      buildInitialExpandedDirs(node.children, depth + 1, result)
    }
  }
  return result
}

function collectDirPaths(nodes: FileTreeNode[], result = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.type === "dir") {
      result.add(node.path)
      if (node.children) {
        collectDirPaths(node.children, result)
      }
    }
  }
  return result
}

function flattenVisibleNodes(
  nodes: FileTreeNode[],
  expandedDirs: Set<string>,
  searchActive: boolean,
  depth = 0,
  parentPath: string | null = null,
  result: VisibleTreeItem[] = [],
): VisibleTreeItem[] {
  for (const node of nodes) {
    result.push({ node, depth, parentPath })
    if (node.type === "dir" && node.children && (searchActive || expandedDirs.has(node.path))) {
      flattenVisibleNodes(node.children, expandedDirs, searchActive, depth + 1, node.path, result)
    }
  }
  return result
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
  const [focusedPath, setFocusedPath] = React.useState<string | null>(selectedPath ?? null)
  const [renamingPath, setRenamingPath] = React.useState<string | null>(null)
  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(() => buildInitialExpandedDirs(tree))
  const treeRootRef = React.useRef<HTMLDivElement>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const displayTree = React.useMemo(
    () => (searchQuery ? filterTree(tree as OverlayTreeNode[], searchQuery, titleMap) : tree),
    [tree, searchQuery, titleMap],
  )
  const searchActive = searchQuery.trim().length > 0

  React.useEffect(() => {
    setFocusedPath(selectedPath ?? null)
  }, [selectedPath])

  React.useEffect(() => {
    const validDirs = collectDirPaths(tree)
    setExpandedDirs((prev) => {
      const next = new Set<string>()
      for (const path of prev) {
        if (validDirs.has(path)) {
          next.add(path)
        }
      }
      return next
    })
  }, [tree])

  const visibleItems = React.useMemo(
    () => flattenVisibleNodes(displayTree, expandedDirs, searchActive),
    [displayTree, expandedDirs, searchActive],
  )

  React.useEffect(() => {
    if (visibleItems.length === 0) {
      setFocusedPath(null)
      return
    }
    if (!focusedPath || !visibleItems.some((item) => item.node.path === focusedPath)) {
      setFocusedPath(visibleItems[0]?.node.path ?? null)
    }
  }, [visibleItems, focusedPath])

  const toggleDir = React.useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const collapseAll = React.useCallback(() => {
    setExpandedDirs(new Set())
  }, [])

  // Keyboard navigation
  React.useEffect(() => {
    const getFocusedIndex = () => visibleItems.findIndex((item) => item.node.path === focusedPath)
    const getFocusedItem = () => {
      const index = getFocusedIndex()
      if (index < 0) return null
      return { item: visibleItems[index], index }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isWithinTree = Boolean(target && treeRootRef.current?.contains(target))
      if (!isWithinTree) return

      const isEditableTarget =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable

      if (e.key === "/") {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if (e.key === "Escape") {
        if (renamingPath) {
          e.preventDefault()
          setRenamingPath(null)
          return
        }
        if (searchQuery || e.target === searchInputRef.current) {
          e.preventDefault()
          setSearchQuery("")
          if (searchInputRef.current) {
            searchInputRef.current.blur()
          }
          return
        }
        if (focusedPath) {
          e.preventDefault()
          setFocusedPath(null)
          return
        }
      }

      if (isEditableTarget) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        const nextIndex = Math.min(visibleItems.length - 1, Math.max(0, getFocusedIndex() + 1))
        const nextItem = visibleItems[nextIndex]
        if (nextItem) {
          setFocusedPath(nextItem.node.path)
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        const nextIndex = Math.max(0, getFocusedIndex() - 1)
        const nextItem = visibleItems[nextIndex]
        if (nextItem) {
          setFocusedPath(nextItem.node.path)
        }
      } else if (e.key === "Enter") {
        const focused = getFocusedItem()
        if (!focused) return
        e.preventDefault()
        if (focused.item.node.type === "file") {
          onSelect(focused.item.node)
        } else {
          toggleDir(focused.item.node.path)
        }
      } else if (e.key === "ArrowRight") {
        const focused = getFocusedItem()
        if (!focused || focused.item.node.type !== "dir") return
        e.preventDefault()

        const isExpanded = searchActive || expandedDirs.has(focused.item.node.path)
        if (!isExpanded) {
          setExpandedDirs((prev) => new Set(prev).add(focused.item.node.path))
          return
        }

        const nextItem = visibleItems[focused.index + 1]
        if (nextItem && nextItem.parentPath === focused.item.node.path) {
          setFocusedPath(nextItem.node.path)
        }
      } else if (e.key === "ArrowLeft") {
        const focused = getFocusedItem()
        if (!focused) return
        e.preventDefault()
        if (focused.item.node.type === "dir" && expandedDirs.has(focused.item.node.path) && !searchActive) {
          setExpandedDirs((prev) => {
            const next = new Set(prev)
            next.delete(focused.item.node.path)
            return next
          })
          return
        }
        if (focused.item.parentPath) {
          setFocusedPath(focused.item.parentPath)
        }
      } else if (e.key === "F2") {
        const focused = getFocusedItem()
        if (!focused || focused.item.node.type !== "file" || !onRenameFile) return
        e.preventDefault()
        setRenamingPath(focused.item.node.path)
      } else if (e.key === "Delete") {
        const focused = getFocusedItem()
        if (!focused || focused.item.node.type !== "file" || !onDeleteFile) return
        e.preventDefault()
        onDeleteFile(focused.item.node.path, focused.item.node.sha)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    visibleItems,
    focusedPath,
    renamingPath,
    searchQuery,
    searchActive,
    expandedDirs,
    onSelect,
    onRenameFile,
    onDeleteFile,
    toggleDir,
  ])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
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
          const sourceParentPath = activeNode.path.split("/").slice(0, -1).join("/")
          if (sourceParentPath === overNode.path) return
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

  const totalFiles = React.useMemo(() => {
    const countFiles = (nodes: FileTreeNode[]): number => {
      return nodes.reduce((acc, node) => {
        if (node.type === "file") return acc + 1
        if (node.children) return acc + countFiles(node.children)
        return acc
      }, 0)
    }
    return countFiles(tree)
  }, [tree])

  const topLevelFolders = React.useMemo(
    () =>
      tree
        .filter((node) => {
          if (node.type !== "dir") return false
          const overlayNode = node as OverlayTreeNode
          return !overlayNode.isDeleted
        })
        .map((node) => ({ path: node.path, name: node.name })),
    [tree],
  )

  return (
    <div ref={treeRootRef} className="h-full flex flex-col bg-studio-canvas text-studio-fg text-sm">
      <div className="p-2 border-b border-studio-border text-xs font-semibold text-studio-fg uppercase tracking-wider flex items-center justify-between sticky top-0 bg-studio-canvas z-10">
        <span>Explorer ({totalFiles})</span>
        <div className="flex items-center gap-1">
          {onCreateFile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md hover:bg-studio-canvas-inset" title="New file">
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleCreateRootFile}>Create in root</DropdownMenuItem>
                {topLevelFolders.map((folder) => (
                  <DropdownMenuItem key={folder.path} onClick={() => onCreateFile(folder.path)}>
                    Create in {folder.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
              id="studio-file-tree-dnd"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <FileContextMenu
                type="background"
                onNewFile={handleCreateRootFile}
                onCollapseAll={collapseAll}
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
                      onUndoDelete={onUndoDelete}
                      onRenameFile={onRenameFile}
                      expandedDirs={expandedDirs}
                      focusedPath={focusedPath}
                      renamingPath={renamingPath}
                      onFocusPath={setFocusedPath}
                      onToggleDir={toggleDir}
                      onStartRename={setRenamingPath}
                      onCancelRename={() => setRenamingPath(null)}
                      onCollapseAll={collapseAll}
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
