import { inferFieldDef, normalizeDate } from "@/lib/framework-adapters"
import type { FrameworkAdapter, FrontmatterFieldDef } from "@/lib/framework-adapters/types"
import type { FileTreeNode } from "@/lib/github"

const CONTENT_EXTENSIONS = /\.(mdx?|markdown)$/i

export function blankSmartCreateValue(field: FrontmatterFieldDef): unknown {
  if (field.type === "date") return normalizeDate(new Date())
  if (field.type === "boolean") return false
  if (field.type === "number") return undefined
  if (field.type === "string[]") return []
  return ""
}

export function findSiblingContentFile(nodes: FileTreeNode[]): FileTreeNode | null {
  for (const node of nodes) {
    if (node.type === "file" && CONTENT_EXTENSIONS.test(node.name) && !/^index\./i.test(node.name)) {
      return node
    }
  }
  return null
}

export function buildSiblingFields(frontmatter: Record<string, unknown>): FrontmatterFieldDef[] {
  const skippedKeys = new Set(["title", "draft"])

  return Object.entries(frontmatter)
    .filter(([key, value]) => {
      if (skippedKeys.has(key) || value == null) return false
      if (typeof value === "object" && !Array.isArray(value)) return false
      if (Array.isArray(value) && value.some((entry) => typeof entry === "object" && entry !== null)) return false
      return true
    })
    .map(([key, value]) => inferFieldDef(key, value))
    .filter((field) => field.type !== "object")
}

function extensionFromPath(path: string | null | undefined): ".md" | ".mdx" | null {
  if (!path) return null
  if (/\.mdx$/i.test(path)) return ".mdx"
  if (/\.(md|markdown)$/i.test(path)) return ".md"
  return null
}

export function resolveSmartCreateExtension({
  adapter,
  siblingPath,
}: {
  adapter: FrameworkAdapter | null
  siblingPath?: string | null
}): ".md" | ".mdx" {
  const siblingExtension = extensionFromPath(siblingPath)
  if (siblingExtension) return siblingExtension

  if (adapter?.fileExtension) return adapter.fileExtension

  // Custom / unknown repos skew toward plain Markdown unless we have a
  // stronger signal from a sibling file or framework adapter.
  return adapter?.id === "custom" ? ".md" : ".mdx"
}
