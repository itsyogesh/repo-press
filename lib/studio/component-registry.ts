/**
 * @deprecated Compatibility facade for the pre-catalog Studio API.
 * Remove in Task 13 after all external callers consume `AuthoringCatalog`.
 */
import {
  type AuthoringComponent,
  type AuthoringComponentMetadata,
  type AuthoringProp,
  type AuthoringPropType,
  buildAuthoringCatalog,
} from "./authoring-catalog"

export type RepoComponentPropType = AuthoringPropType
export type RepoComponentPropDef = AuthoringProp
export type RepoComponentDef = AuthoringComponent
export type ConfigComponentEntry = AuthoringComponentMetadata
export type AdapterComponentEntry = AuthoringComponentMetadata

export type RepoComponentCapabilityFlags = {
  inline?: boolean
  media?: boolean
  configurable?: boolean
}

export function deriveCapabilities(props: AuthoringProp[], kind: "flow" | "text"): RepoComponentCapabilityFlags {
  return {
    inline: kind === "text",
    media: props.some((prop) => prop.type === "image"),
    configurable: props.length > 0,
  }
}

/** @deprecated Framework-name schema guessing is intentionally disabled. */
export function getFrameworkFallbacks(_framework?: string): Record<string, ConfigComponentEntry> {
  return {}
}

/** @deprecated Framework-name schema guessing is intentionally disabled. */
export const KNOWN_ADAPTER_FALLBACKS: Record<string, ConfigComponentEntry> = {}

/**
 * @deprecated Use `buildAuthoringCatalog` with names and metadata.
 * Executable adapter values are never inspected or copied into the result.
 */
export function buildComponentRegistry(
  adapterComponents?: Readonly<Record<string, unknown>> | null,
  projectComponents?: Readonly<Record<string, ConfigComponentEntry>> | null,
  framework?: string,
): Record<string, AuthoringComponent> {
  const catalog = buildAuthoringCatalog({
    nativeComponentNames: Object.keys(adapterComponents ?? {}),
    metadata: projectComponents,
    framework,
  })
  return Object.fromEntries(catalog.map((component) => [component.mdxName, component]))
}
