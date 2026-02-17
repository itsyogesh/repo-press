"use client"

import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { FileTreeNode } from "@/lib/github"
import { cn } from "@/lib/utils"

interface FileTreeProps {
  tree: FileTreeNode[]
  onSelect: (node: FileTreeNode) => void
  selectedPath?: string
}

export function FileTree({ tree, onSelect, selectedPath }: FileTreeProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">Explorer</div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {tree.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3 text-center">No content files found</div>
          ) : (
            tree.map((node) => (
              <TreeItem key={node.path} node={node} depth={0} onSelect={onSelect} selectedPath={selectedPath} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface TreeItemProps {
  node: FileTreeNode
  depth: number
  onSelect: (node: FileTreeNode) => void
  selectedPath?: string
}

function TreeItem({ node, depth, onSelect, selectedPath }: TreeItemProps) {
  const [isOpen, setIsOpen] = React.useState(depth < 2)

  if (node.type === "dir") {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          className={cn("w-full justify-start gap-1 px-1 h-7 font-normal rounded-sm hover:bg-accent")}
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
          <span className="truncate text-sm">{node.name}</span>
        </Button>
        {isOpen && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeItem key={child.path} node={child} depth={depth + 1} onSelect={onSelect} selectedPath={selectedPath} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start gap-1 px-1 h-7 font-normal rounded-sm",
        selectedPath === node.path && "bg-accent text-accent-foreground",
      )}
      style={{ paddingLeft: `${depth * 12 + 22}px` }}
      onClick={() => onSelect(node)}
    >
      <File className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm">{node.name}</span>
    </Button>
  )
}
