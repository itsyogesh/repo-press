/**
 * Dependency-free title extraction for server/runtime contexts (e.g. Convex actions)
 * where bundling the TypeScript compiler or gray-matter is undesirable.
 * Handles YAML frontmatter `title:` and MDX `export const metadata = { title: ... }`.
 */
export function extractTitleFromContent(rawContent: string, filePath: string): string {
  const fallback = filePath.split("/").pop()?.replace(/\.(mdx?|markdown)$/i, "") || filePath

  const fmMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fmMatch) {
    const titleMatch = fmMatch[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (titleMatch?.[1]?.trim()) return titleMatch[1].trim()
  }

  const metaMatch = rawContent.match(
    /export\s+const\s+metadata\s*=\s*\{[\s\S]*?\btitle\s*:\s*["'`]([^"'`]+)["'`]/,
  )
  if (metaMatch?.[1]?.trim()) return metaMatch[1].trim()

  return fallback
}
