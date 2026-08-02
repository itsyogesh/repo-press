"use client"

import { AlertCircle, Folder, Loader2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { fetchRepoDirsAction } from "@/app/dashboard/[owner]/[repo]/actions"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog"
import { ScrollArea } from "./ui/scroll-area"
import { Tree, TreeItem, TreeProvider } from "./ui/tree"

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

  // Load root directories when dialog opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally excluding initialPath to avoid re-fetching on path change
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

  const loadChildren = useCallback(
    async (path: string) => {
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

  const handleNodeExpand = useCallback(
    (nodeId: string, expanded: boolean) => {
      if (!expanded || nodeId === "") return
      const node = findNodeInTree(tree, nodeId)
      if (node && node.children === null) {
        loadChildren(nodeId)
      }
    },
    [tree, loadChildren],
  )

  const handleConfirm = () => {
    onSelect(selectedPath)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="rp-display">Select Content Root</DialogTitle>
          <DialogDescription>
            Browse directories in {owner}/{repo} to select the content root folder.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[300px] rounded-md border">
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
            <TreeProvider
              variant="ghost"
              className="!border-0 !shadow-none !rounded-none"
              selectedIds={[selectedPath]}
              onSelectionChange={(ids) => setSelectedPath(ids[0] ?? "")}
              onNodeExpand={handleNodeExpand}
              showLines
              showIcons
              indent={16}
              animateExpand
            >
              <Tree>
                {/* Repo root - always present */}
                <TreeItem
                  nodeId=""
                  label="(repo root)"
                  icon={<Folder className="h-4 w-4" />}
                  hasChildren={false}
                  level={0}
                />
                {tree.map((node, i) => (
                  <FolderNodeTreeItem
                    key={node.path}
                    node={node}
                    level={0}
                    isLast={i === tree.length - 1}
                    parentPath={[]}
                  />
                ))}
              </Tree>
            </TreeProvider>
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

// --- Recursive tree item for folder nodes ---

function FolderNodeTreeItem({
  node,
  level,
  isLast,
  parentPath,
}: {
  node: FolderNode
  level: number
  isLast: boolean
  parentPath: boolean[]
}) {
  const hasChildren = node.children === null || node.children.length > 0
  const currentPath = [...parentPath, isLast]

  return (
    <TreeItem
      nodeId={node.path}
      label={node.name}
      level={level}
      isLast={isLast}
      parentPath={parentPath}
      hasChildren={hasChildren}
      icon={<Folder className="h-4 w-4" />}
    >
      {node.isLoading ? (
        <div className="flex items-center py-1" style={{ paddingLeft: `${(level + 1) * 16 + 28}px` }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        </div>
      ) : node.error ? (
        <p className="text-xs text-destructive py-1" style={{ paddingLeft: `${(level + 1) * 16 + 28}px` }}>
          {node.error}
        </p>
      ) : node.children && node.children.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1" style={{ paddingLeft: `${(level + 1) * 16 + 28}px` }}>
          No subfolders
        </p>
      ) : node.children ? (
        node.children.map((child, i) => (
          <FolderNodeTreeItem
            key={child.path}
            node={child}
            level={level + 1}
            isLast={i === node.children!.length - 1}
            parentPath={currentPath}
          />
        ))
      ) : null}
    </TreeItem>
  )
}

// --- Utility helpers ---

function findNodeInTree(nodes: FolderNode[], targetPath: string): FolderNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node
    if (node.children) {
      const found = findNodeInTree(node.children, targetPath)
      if (found) return found
    }
  }
  return null
}

function updateNodeInTree(nodes: FolderNode[], targetPath: string, updates: Partial<FolderNode>): FolderNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, ...updates }
    }
    if (node.children && targetPath.startsWith(`${node.path}/`)) {
      return {
        ...node,
        children: updateNodeInTree(node.children, targetPath, updates),
      }
    }
    return node
  })
}
