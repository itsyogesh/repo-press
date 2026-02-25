import type { FileTreeNode } from "./github"

export type OverlayTreeNode = FileTreeNode & {
  isNew?: boolean
  isDeleted?: boolean
}

export type ExplorerOp = {
  opType: "create" | "delete"
  filePath: string
  status: "pending" | "committed" | "undone"
}

/**
 * Build full repo path from contentRoot-relative path.
 * If contentRoot is empty, returns filePath as-is.
 */
export function prefixContentRoot(filePath: string, contentRoot: string): string {
  if (!contentRoot) return filePath
  return `${contentRoot}/${filePath}`
}

/**
 * Deep clone a tree of FileTreeNodes into OverlayTreeNodes.
 */
function cloneTree(tree: FileTreeNode[]): OverlayTreeNode[] {
  return tree.map((node) => ({
    ...node,
    children: node.children ? cloneTree(node.children) : undefined,
  }))
}

/**
 * Sort children at each level: dirs first, then files, alphabetically within each group.
 */
function sortChildren(nodes: OverlayTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const node of nodes) {
    if (node.children) sortChildren(node.children)
  }
}

/**
 * Find a node in the tree by its full path.
 * Returns the node if found, or undefined.
 */
function findNode(tree: OverlayTreeNode[], fullPath: string): OverlayTreeNode | undefined {
  for (const node of tree) {
    if (node.path === fullPath) return node
    if (node.children) {
      const found = findNode(node.children, fullPath)
      if (found) return found
    }
  }
  return undefined
}

/**
 * Ensure a directory node exists at the given path, creating intermediate
 * directories as needed. Returns the directory node.
 */
function ensureDir(tree: OverlayTreeNode[], dirPath: string, contentRoot: string): OverlayTreeNode {
  const existing = findNode(tree, dirPath)
  if (existing) return existing

  // Determine parent path
  const parts = dirPath.split("/")
  const name = parts[parts.length - 1]

  const dirNode: OverlayTreeNode = {
    name,
    path: dirPath,
    sha: "",
    type: "dir",
    children: [],
    isNew: true,
  }

  if (parts.length <= 1 || dirPath === contentRoot) {
    // Top-level directory (no parent within contentRoot)
    tree.push(dirNode)
    return dirNode
  }

  const parentPath = parts.slice(0, -1).join("/")

  // If parentPath is the contentRoot itself (or empty), insert at root level
  if (!parentPath || parentPath === contentRoot) {
    tree.push(dirNode)
    return dirNode
  }

  const parent = ensureDir(tree, parentPath, contentRoot)
  if (!parent.children) parent.children = []
  parent.children.push(dirNode)
  return parent.children[parent.children.length - 1]
}

/**
 * Merge pending explorer ops onto a GitHub file tree.
 * - Create ops add nodes with isNew: true
 * - Delete ops mark existing nodes with isDeleted: true
 * Returns a new tree (does not mutate the input).
 */
export function overlayOpsOnTree(
  tree: FileTreeNode[],
  ops: ExplorerOp[],
  contentRoot: string,
): OverlayTreeNode[] {
  const result = cloneTree(tree)

  // Process delete ops
  for (const op of ops) {
    if (op.opType !== "delete" || op.status !== "pending") continue
    const fullPath = prefixContentRoot(op.filePath, contentRoot)
    const node = findNode(result, fullPath)
    if (node) {
      node.isDeleted = true
    }
  }

  // Process create ops
  for (const op of ops) {
    if (op.opType !== "create" || op.status !== "pending") continue
    const fullPath = prefixContentRoot(op.filePath, contentRoot)

    // Don't create if a node already exists at this path
    if (findNode(result, fullPath)) continue

    const parts = fullPath.split("/")
    const name = parts[parts.length - 1]

    const fileNode: OverlayTreeNode = {
      name,
      path: fullPath,
      sha: "",
      type: "file",
      isNew: true,
    }

    const parentPath = parts.slice(0, -1).join("/")

    if (!parentPath || parentPath === contentRoot) {
      // File goes at root level
      result.push(fileNode)
    } else {
      const parentDir = ensureDir(result, parentPath, contentRoot)
      if (!parentDir.children) parentDir.children = []
      parentDir.children.push(fileNode)
    }
  }

  // Sort everything
  sortChildren(result)

  return result
}

/**
 * Filter tree by search query. Matches against filename, path, or title.
 * Preserves folder ancestry for matching descendants.
 */
export function filterTree(
  tree: OverlayTreeNode[],
  query: string,
  titleMap?: Record<string, string>,
): OverlayTreeNode[] {
  if (!query) return tree

  const lowerQuery = query.toLowerCase()

  function matches(node: OverlayTreeNode): boolean {
    if (node.name.toLowerCase().includes(lowerQuery)) return true
    if (node.path.toLowerCase().includes(lowerQuery)) return true
    if (titleMap && titleMap[node.path]?.toLowerCase().includes(lowerQuery)) return true
    return false
  }

  function filterNodes(nodes: OverlayTreeNode[]): OverlayTreeNode[] {
    const filtered: OverlayTreeNode[] = []

    for (const node of nodes) {
      if (node.type === "file") {
        if (matches(node)) {
          filtered.push(node)
        }
      } else {
        // Directory node
        if (matches(node)) {
          // Dir name matches — include it with all its children
          filtered.push(node)
        } else if (node.children) {
          // Dir name doesn't match — recurse and include only if children match
          const matchingChildren = filterNodes(node.children)
          if (matchingChildren.length > 0) {
            filtered.push({
              ...node,
              children: matchingChildren,
            })
          }
        }
      }
    }

    return filtered
  }

  return filterNodes(tree)
}

/**
 * Count pending create and delete operations.
 */
export function countPendingOps(ops: ExplorerOp[]): { creates: number; deletes: number } {
  let creates = 0
  let deletes = 0

  for (const op of ops) {
    if (op.status !== "pending") continue
    if (op.opType === "create") creates++
    else if (op.opType === "delete") deletes++
  }

  return { creates, deletes }
}
