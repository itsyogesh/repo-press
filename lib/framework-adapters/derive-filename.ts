/**
 * Derives a final filename from a user-supplied title, a naming strategy, and
 * the set of filenames already present in the target folder.
 *
 * Strategies:
 * - "slug"           → `{slug}{ext}`
 * - "index-if-empty" → `{slug}/index{ext}` if existingNames is empty,
 *                      else `{slug}{ext}`
 * - "date-slug"      → `YYYY-MM-DD-{slug}{ext}`
 *
 * Conflict resolution: if the derived filename already exists in existingNames,
 * appends -2, -3, etc. until a free name is found.
 */

import { slugify } from "../slug"
import type { NamingStrategy } from "./types"

export type DeriveFilenameOptions = {
  title: string
  strategy: NamingStrategy
  extension: ".mdx" | ".md"
  /** Names already present in the target folder (filenames only, e.g. "my-post.mdx") */
  existingNames: string[]
  /** ISO date string or Date instance. Required when strategy === "date-slug". Defaults to today. */
  date?: string | Date
}

/** Formats a Date as "YYYY-MM-DD". */
function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Builds the base filename (without conflict-resolution suffix) for a given slug
 * and strategy.
 *
 * Returns either a plain filename (e.g. "my-post.mdx") or a path-like string
 * for index files (e.g. "my-post/index.mdx").
 */
function buildBase(slug: string, strategy: NamingStrategy, ext: string, existingNames: string[], date: Date): string {
  switch (strategy) {
    case "date-slug":
      return `${formatDate(date)}-${slug}${ext}`

    case "index-if-empty":
      // Use index file pattern only when the folder is empty
      if (existingNames.length === 0) {
        return `${slug}/index${ext}`
      }
      return `${slug}${ext}`

    default:
      return `${slug}${ext}`
  }
}

/**
 * Inserts a numeric suffix into a filename before its extension (or before the
 * final component if it is a path like "slug/index.mdx").
 *
 * Examples:
 *   "my-post.mdx"        + 2 → "my-post-2.mdx"
 *   "my-post/index.mdx"  + 2 → "my-post-2/index.mdx"
 */
function applyConflictSuffix(base: string, suffix: number, ext: string): string {
  if (base.includes("/")) {
    // index-if-empty path: insert suffix into the folder segment
    const slashIdx = base.indexOf("/")
    const folderPart = base.slice(0, slashIdx)
    const rest = base.slice(slashIdx)
    return `${folderPart}-${suffix}${rest}`
  }
  // Plain filename: insert before extension
  const withoutExt = base.endsWith(ext) ? base.slice(0, -ext.length) : base
  return `${withoutExt}-${suffix}${ext}`
}

/**
 * Returns a filename that does not conflict with any entry in existingNames.
 */
export function deriveFilename(opts: DeriveFilenameOptions): string {
  const { title, strategy, extension, existingNames } = opts
  const date = opts.date ? new Date(opts.date) : new Date()

  const slug = slugify(title)
  const base = buildBase(slug, strategy, extension, existingNames, date)

  // The lookup set uses only the top-level name (e.g. "my-post" for "my-post/index.mdx")
  const existingSet = new Set(existingNames)

  // For index-if-empty, the conflict check is against the folder name, not the full path
  const conflictKey = base.includes("/") ? base.split("/")[0] : base

  if (!existingSet.has(conflictKey)) return base

  // Find the next free suffix (cap at 1000 to prevent runaway loops)
  const MAX_CONFLICT_SUFFIX = 1000
  let n = 2
  while (n <= MAX_CONFLICT_SUFFIX) {
    const candidate = applyConflictSuffix(base, n, extension)
    const candidateKey = candidate.includes("/") ? candidate.split("/")[0] : candidate
    if (!existingSet.has(candidateKey)) return candidate
    n++
  }

  // Fallback: return the last candidate (extremely unlikely to reach here)
  return applyConflictSuffix(base, MAX_CONFLICT_SUFFIX + 1, extension)
}
