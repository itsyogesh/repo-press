"use client"

import { ChevronRight, Folder, FolderOpen, Loader2, AlertCircle } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { fetchRepoDirsAction } from "@/app/dashboard/[owner]/[repo]/actions"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog"
import { ScrollArea } from "./ui/scroll-area"
import { cn } from "@/lib/utils"

type FolderNode = {
  name: string
  path: string // full repo-relative path (e.g. "content/docs")
  children: FolderNode[] | null // null = not yet loaded
  isLoading: boolean
  error: string | null
}

interface FolderPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
  owner: string
  repo: string
  branch: string
  initialPath?: string // pre-selected path when dialog opens
}

export function FolderPickerDialog({
  open,
  onOpenChange,
  onSelect,
  owner,
  repo,
  branch,
  initialPath = "",
}: FolderPickerDialogProps) {
  const [tree, setTree] = useState<FolderNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string>(initialPath)
  const [isLoadingRoot, setIsLoadingRoot] = useState(false)
  const [rootError, setRootError] = useState<string | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  // Load root directories when dialog opens
  useEffect(() => {
    if (!open) return
    setSelectedPath(initialPath ?? "")
    setIsLoadingRoot(true)
    setRootError(null)

    fetchRepoDirsAction(owner, repo, "", branch).then((result) => {
      setIsLoadingRoot(false)
      if (result.success) {
        setTree(
          result.dirs.map((d) => ({
            name: d.name,
            path: d.path,
            children: null,
            isLoading: false,
            error: null,
          })),
        )
      } else {
        setRootError(result.error)
        setTree([])
      }
    })
  }, [open, owner, repo, branch])
  // Note: intentionally excluding initialPath from deps to avoid re-fetching on path change

  const loadChildren = useCallback(
    async (path: string) => {
      // Mark node as loading
      setTree((prev) => updateNodeInTree(prev, path, { isLoading: true, error: null }))

      const result = await fetchRepoDirsAction(owner, repo, path, branch)

      if (result.success) {
        setTree((prev) =>
          updateNodeInTree(prev, path, {
            isLoading: false,
            children: result.dirs.map((d) => ({
              name: d.name,
              path: d.path,
              children: null,
              isLoading: false,
              error: null,
            })),
          }),
        )
      } else {
        setTree((prev) =>
          updateNodeInTree(prev, path, {
            isLoading: false,
            error: result.error,
          }),
        )
      }
    },
    [owner, repo, branch],
  )

  const handleToggle = (node: FolderNode) => {
    if (node.children !== null) {
      // Children already loaded — toggle expanded state
      setExpandedPaths((prev) => {
        const next = new Set(prev)
        if (next.has(node.path)) {
          next.delete(node.path)
        } else {
          next.add(node.path)
        }
        return next
      })
    } else {
      // First expand: load children
      setExpandedPaths((prev) => new Set(prev).add(node.path))
      loadChildren(node.path)
    }
  }

  const handleConfirm = () => {
    onSelect(selectedPath)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Content Root</DialogTitle>
          <DialogDescription>
            Browse directories in {owner}/{repo} to select the content root folder.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[300px] rounded-md border p-2">
          {/* Repo root option — always present */}
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
              selectedPath === "" && "bg-accent text-accent-foreground font-medium",
            )}
            onClick={() => setSelectedPath("")}
          >
            <Folder className="h-4 w-4 text-muted-foreground" />
            <span>(repo root)</span>
          </button>

          {isLoadingRoot ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rootError ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>{rootError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsLoadingRoot(true)
                  setRootError(null)
                  fetchRepoDirsAction(owner, repo, "", branch).then((result) => {
                    setIsLoadingRoot(false)
                    if (result.success) {
                      setTree(
                        result.dirs.map((d) => ({
                          name: d.name,
                          path: d.path,
                          children: null,
                          isLoading: false,
                          error: null,
                        })),
                      )
                    } else {
                      setRootError(result.error)
                    }
                  })
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            <FolderTreeNodes
              nodes={tree}
              depth={0}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onSelect={setSelectedPath}
              onToggle={handleToggle}
            />
          )}
        </ScrollArea>

        <div className="text-sm text-muted-foreground">
          Selected: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{selectedPath || "(repo root)"}</code>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Internal helper components and functions ---

function FolderTreeNodes({
  nodes,
  depth,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
}: {
  nodes: FolderNode[]
  depth: number
  selectedPath: string
  expandedPaths: Set<string>
  onSelect: (path: string) => void
  onToggle: (node: FolderNode) => void
}) {
  if (nodes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-1" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
        No subfolders
      </p>
    )
  }

  return (
    <>
      {nodes.map((node) => {
        const isExpanded = expandedPaths.has(node.path)
        const isSelected = selectedPath === node.path
        return (
          <div key={node.path}>
            <div
              className={cn(
                "flex items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-accent cursor-pointer",
                isSelected && "bg-accent text-accent-foreground font-medium",
              )}
              style={{ paddingLeft: `${depth * 16 + 4}px` }}
            >
              <button
                type="button"
                className="p-0.5 hover:bg-muted rounded"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(node)
                }}
              >
                {node.isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <ChevronRight
                    className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-90")}
                  />
                )}
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 flex-1 text-left"
                onClick={() => onSelect(node.path)}
              >
                {isExpanded ? (
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Folder className="h-4 w-4 text-muted-foreground" />
                )}
                <span>{node.name}</span>
              </button>
            </div>

            {node.error && (
              <p className="text-xs text-destructive py-1" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
                {node.error}
              </p>
            )}

            {isExpanded && node.children !== null && (
              <FolderTreeNodes
                nodes={node.children}
                depth={depth + 1}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

function updateNodeInTree(nodes: FolderNode[], targetPath: string, updates: Partial<FolderNode>): FolderNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, ...updates }
    }
    if (node.children && targetPath.startsWith(node.path + "/")) {
      return {
        ...node,
        children: updateNodeInTree(node.children, targetPath, updates),
      }
    }
    return node
  })
}
