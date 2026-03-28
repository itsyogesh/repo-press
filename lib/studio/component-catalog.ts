// ---------------------------------------------------------------------------
// Component Catalog — UI projection from registry
// ---------------------------------------------------------------------------
//
// The catalog is a **read-only view** derived entirely from the registry.
// It never mutates or extends registry data — it only projects it into a
// shape convenient for UI rendering (sorted list with display labels).
// ---------------------------------------------------------------------------

import type { RepoComponentDef } from "./component-registry"

/** Catalog entry — same shape as `RepoComponentDef` (identity projection). */
export type CatalogEntry = RepoComponentDef

/** Options for {@link buildComponentCatalog}. */
export type BuildComponentCatalogOptions = {
  /**
   * When `true`, the catalog is filtered to only components with
   * `source === "config"` or `source === "merged"`.
   *
   * Set this when `repopress.config.json` explicitly lists at least one
   * component — adapter-only auto-discovered components become noise for
   * non-technical users writing blog posts.
   */
  hasProjectComponents?: boolean
}

/**
 * Build a sorted catalog array from the registry map.
 *
 * - Sorted alphabetically by display label.
 * - Display label: `displayName ?? name`.
 * - Description: passthrough from registry (may be `undefined`).
 *
 * When `options.hasProjectComponents` is `true`, only `"config"` and
 * `"merged"` source components are included — adapter-only auto-discovered
 * components are excluded.
 */
export function buildComponentCatalog(
  registry: Record<string, RepoComponentDef>,
  options?: BuildComponentCatalogOptions,
): CatalogEntry[] {
  const defs = Object.values(registry)

  const filtered = options?.hasProjectComponents
    ? defs.filter((def) => def.source === "config" || def.source === "merged")
    : defs

  return filtered.sort((a, b) => {
    const labelA = a.displayName ?? a.name
    const labelB = b.displayName ?? b.name
    return labelA.localeCompare(labelB)
  })
}

/**
 * Get the display label for a catalog/registry entry.
 * Falls back from `displayName` to `name`.
 */
export function getComponentLabel(def: RepoComponentDef): string {
  return def.displayName ?? def.name
}

// ---------------------------------------------------------------------------
// Category derivation
// ---------------------------------------------------------------------------

export type ComponentCategory = "Media" | "Layout" | "Content" | "Custom"

export const ALL_CATEGORIES: ComponentCategory[] = ["Media", "Layout", "Content", "Custom"]

/**
 * Derive a category for a component definition based on its capabilities and kind.
 *
 * Priority: Media > Content (inline/text) > Layout (has children) > Custom
 */
export function deriveCategory(def: RepoComponentDef): ComponentCategory {
  if (def.capabilities?.media) return "Media"
  if (def.kind === "text" || def.capabilities?.inline) return "Content"
  if (def.hasChildren) return "Layout"
  return "Custom"
}

/**
 * Group catalog entries by their derived category.
 * Returns a Map from category name to array of entries.
 */
export function groupByCategory(catalog: CatalogEntry[]): Map<ComponentCategory, CatalogEntry[]> {
  const groups = new Map<ComponentCategory, CatalogEntry[]>()
  for (const entry of catalog) {
    const cat = deriveCategory(entry)
    const list = groups.get(cat) ?? []
    list.push(entry)
    groups.set(cat, list)
  }
  return groups
}
