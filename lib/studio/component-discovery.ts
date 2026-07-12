import type { AuthoringCatalog } from "./authoring-catalog"
import { AUTHORING_CATALOG_LIMITS, extendAuthoringCatalogWithNativeNames } from "./authoring-catalog"

export const CURRENT_DOCUMENT_DISCOVERY_DIAGNOSTIC =
  "COMPONENT_DISCOVERY_CURRENT_DOCUMENT_ONLY: Native component discovery is limited to the current document and serializable project metadata."

export function discoverMdxComponentNames(content: string): string[] {
  const names = new Set<string>()
  const componentTag = /<\/?([A-Z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\b/g
  for (const match of content.matchAll(componentTag)) {
    const name = match[1]
    if (!name) continue
    names.add(name)
    if (names.size > AUTHORING_CATALOG_LIMITS.maxComponents) {
      throw new TypeError("Authoring catalog exceeds component count limit")
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b))
}

export function buildCurrentDocumentAuthoringState(
  baseCatalog: AuthoringCatalog,
  content: string,
  existingNativeNames: readonly string[] = [],
  existingDiagnostics: readonly string[] = [],
) {
  const nativeComponentNames = Array.from(
    new Set([...existingNativeNames, ...discoverMdxComponentNames(content)]),
  ).sort((a, b) => a.localeCompare(b))
  return Object.freeze({
    authoringCatalog: extendAuthoringCatalogWithNativeNames(baseCatalog, nativeComponentNames),
    nativeComponentNames: Object.freeze(nativeComponentNames),
    diagnostics: Object.freeze([...existingDiagnostics, CURRENT_DOCUMENT_DISCOVERY_DIAGNOSTIC]),
  })
}
