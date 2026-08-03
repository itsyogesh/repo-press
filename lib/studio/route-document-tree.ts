import type { OverlayTreeNode } from "@/lib/explorer-tree-overlay"
import type { FileTreeNode } from "@/lib/github"

const ROUTE_DOCUMENT_NAMES = new Set(["page.md", "page.mdx", "index.md", "index.mdx"])

export type RouteDocumentTreeItem =
  | {
      kind: "node"
      source: FileTreeNode
      children?: RouteDocumentTreeItem[]
    }
  | {
      kind: "route-document"
      routePath: string
      segment: string
      source: FileTreeNode
      label: string
      secondaryLabel: string
    }

export interface BuildRouteDocumentTreeOptions {
  detectedFramework?: string
  titleMap?: Record<string, string>
}

function humanizeRouteSegment(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ")
}

function isRouteDocumentLeaf(node: FileTreeNode): boolean {
  return (
    node.type === "file" && ROUTE_DOCUMENT_NAMES.has(node.name.toLowerCase()) && !(node as OverlayTreeNode).isDeleted
  )
}

function buildNode(node: FileTreeNode, options: BuildRouteDocumentTreeOptions): RouteDocumentTreeItem {
  if (
    options.detectedFramework === "next-mdx" &&
    node.type === "dir" &&
    !(node as OverlayTreeNode).isDeleted &&
    node.children?.length === 1 &&
    isRouteDocumentLeaf(node.children[0])
  ) {
    const source = node.children[0]
    const segment = node.name
    return {
      kind: "route-document",
      routePath: node.path,
      segment,
      source,
      label: options.titleMap?.[source.path] || humanizeRouteSegment(segment),
      secondaryLabel: segment,
    }
  }

  return {
    kind: "node",
    source: node,
    ...(node.children ? { children: node.children.map((child) => buildNode(child, options)) } : {}),
  }
}

export function buildRouteDocumentTree(
  nodes: FileTreeNode[],
  options: BuildRouteDocumentTreeOptions,
): RouteDocumentTreeItem[] {
  return nodes.map((node) => buildNode(node, options))
}
