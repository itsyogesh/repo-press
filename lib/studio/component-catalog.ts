import type { AuthoringCatalog, AuthoringComponent } from "./authoring-catalog"
import { componentAcceptsChildren } from "./authoring-catalog"

export type CatalogEntry = AuthoringComponent

/** @deprecated Project metadata must not hide discovered native components. */
export type BuildComponentCatalogOptions = { hasProjectComponents?: boolean }

export function buildComponentCatalog(
  source: AuthoringCatalog | Readonly<Record<string, AuthoringComponent>>,
  _options?: BuildComponentCatalogOptions,
): CatalogEntry[] {
  const entries = Array.isArray(source) ? [...source] : Object.values(source)
  return entries.sort(
    (a, b) => getComponentLabel(a).localeCompare(getComponentLabel(b)) || a.mdxName.localeCompare(b.mdxName),
  )
}

export function getComponentLabel(def: AuthoringComponent): string {
  return def.displayName
}

export type ComponentCategory = "Media" | "Layout" | "Content" | "Custom"
export const ALL_CATEGORIES: ComponentCategory[] = ["Media", "Layout", "Content", "Custom"]

export function deriveCategory(def: AuthoringComponent): ComponentCategory {
  if (def.category && ALL_CATEGORIES.includes(def.category as ComponentCategory)) {
    return def.category as ComponentCategory
  }
  if (def.props.some((prop) => prop.type === "image")) return "Media"
  if (def.kind === "text") return "Content"
  if (componentAcceptsChildren(def)) return "Layout"
  return "Custom"
}

export function groupByCategory(catalog: CatalogEntry[]): Map<ComponentCategory, CatalogEntry[]> {
  const groups = new Map<ComponentCategory, CatalogEntry[]>()
  for (const entry of catalog) {
    const category = deriveCategory(entry)
    groups.set(category, [...(groups.get(category) ?? []), entry])
  }
  return groups
}
