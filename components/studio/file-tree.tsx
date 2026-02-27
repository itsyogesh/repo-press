"use client"

import { ChevronDown, ChevronRight, File, Folder, FolderOpen, Plus, Search, Trash2, Undo2, X } from "lucide-react"
import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { filterTree } from "@/lib/explorer-tree-overlay"
import type { OverlayTreeNode } from "@/lib/explorer-tree-overlay"
import type { FileTreeNode } from "@/lib/github"
import { cn } from "@/lib/utils"

interface FileTreeProps {
  tree: FileTreeNode[]
  onSelect: (node: FileTreeNode) => void
  selectedPath?: string
  titleMap?: Record<string, string>
  onCreateFile?: (parentPath: string) => void
  onDeleteFile?: (filePath: string, sha: string) => void
  onUndoDelete?: (filePath: string) => void
}

export function FileTree({
  tree,
  onSelect,
  selectedPath,
  titleMap,
  onCreateFile,
  onDeleteFile,
  onUndoDelete,
}: FileTreeProps) {
  const [searchQuery, setSearchQuery] = React.useState("")

  const displayTree = React.useMemo(
    () => (searchQuery ? filterTree(tree as OverlayTreeNode[], searchQuery, titleMap) : tree),
    [tree, searchQuery, titleMap],
  )

  const topLevelFolders = React.useMemo(() => {
    return tree
      .filter((node) => node.type === "dir")
      .map((node) => ({ name: node.name, path: node.path }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tree])

  const handleCreateClick = (path: string) => {
    if (onCreateFile) {
      onCreateFile(path)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
        <span>Explorer</span>
        {onCreateFile && topLevelFolders.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                title="New file"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => handleCreateClick("")}>
                <Folder className="mr-2 h-4 w-4" />
                Root
              </DropdownMenuItem>
              {topLevelFolders.map((folder) => (
                <DropdownMenuItem key={folder.path} onClick={() => handleCreateClick(folder.path)}>
                  <Folder className="mr-2 h-4 w-4" />
                  {folder.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : onCreateFile ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => onCreateFile("")}
            title="New file in root"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-7 pr-7 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-1">
          {displayTree.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3 text-center">
              {searchQuery ? "No matching files" : "No content files found"}
            </div>
          ) : (
            <div>
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
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface TreeItemProps {
  node: FileTreeNode
  depth: number
  onSelect: (node: FileTreeNode) => void
  selectedPath?: string
  titleMap?: Record<string, string>
  onCreateFile?: (parentPath: string) => void
  onDeleteFile?: (filePath: string, sha: string) => void
  onUndoDelete?: (filePath: string) => void
}

function TreeItem({
  node,
  depth,
  onSelect,
  selectedPath,
  titleMap,
  onCreateFile,
  onDeleteFile,
  onUndoDelete,
}: TreeItemProps) {
  const [isOpen, setIsOpen] = React.useState(depth < 2)

  const overlay = node as OverlayTreeNode
  const isNew = overlay.isNew
  const isDeleted = overlay.isDeleted

  if (node.type === "dir") {
    return (
      <div>
        <div className="group relative flex items-center">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-start gap-1 px-1 h-7 font-normal rounded-sm hover:bg-accent",
              isDeleted && "opacity-50",
            )}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            {isOpen ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-blue-500" />
            )}
            <span className={cn("truncate text-sm", isDeleted && "line-through")}>{node.name}</span>
            {isNew && (
              <Badge
                variant="secondary"
                className="ml-1 h-4 px-1 text-[10px] bg-emerald-500/15 text-emerald-600 border-0"
              >
                NEW
              </Badge>
            )}
          </Button>
          {onCreateFile && !isDeleted && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-0 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onCreateFile(node.path)
              }}
              title={`New file in ${node.name}`}
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
        </div>
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
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const displayTitle = titleMap?.[node.path]

  return (
    <div className="group relative flex items-center">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "w-full justify-start gap-1 px-1 font-normal rounded-sm",
          displayTitle ? "h-auto py-1" : "h-7",
          selectedPath === node.path && "bg-accent text-accent-foreground",
          isDeleted && "opacity-50",
        )}
        style={{ paddingLeft: `${depth * 12 + 22}px` }}
        onClick={() => !isDeleted && onSelect(node)}
        title={node.name}
        disabled={isDeleted}
      >
        <File
          className={cn(
            "h-4 w-4 shrink-0",
            isNew ? "text-emerald-600" : isDeleted ? "text-destructive" : "text-muted-foreground",
          )}
        />
        <span className={cn("truncate text-sm", isDeleted && "line-through text-muted-foreground")}>
          {displayTitle || node.name}
        </span>
        {isNew && (
          <Badge
            variant="secondary"
            className="ml-1 h-4 px-1 text-[10px] bg-emerald-500/15 text-emerald-600 border-0 shrink-0"
          >
            NEW
          </Badge>
        )}
      </Button>
      {isDeleted && onUndoDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-0 h-5 w-auto px-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground text-[10px] gap-0.5"
          onClick={(e) => {
            e.stopPropagation()
            onUndoDelete(node.path)
          }}
          title="Undo delete"
        >
          <Undo2 className="h-3 w-3" />
          Undo
        </Button>
      )}
      {!isDeleted && !isNew && onDeleteFile && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-0 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onDeleteFile(node.path, node.sha)
          }}
          title="Delete file"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
