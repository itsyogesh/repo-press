// ---------------------------------------------------------------------------
// Component Registry — single runtime source of truth
// ---------------------------------------------------------------------------

/** Allowed prop types for component definitions. */
export type RepoComponentPropType = "string" | "number" | "boolean" | "expression" | "image"

/** A single prop definition within a component schema. */
export type RepoComponentPropDef = {
  name: string
  type: RepoComponentPropType
  label?: string
  default?: unknown
}

/** Optional capability flags computed from a component definition. */
export type RepoComponentCapabilityFlags = {
  /** Component can appear inline (text-level). */
  inline?: boolean
  /** Component accepts at least one `image` prop. */
  media?: boolean
  /** Component has one or more configurable props. */
  configurable?: boolean
}

/**
 * Canonical component definition used throughout the studio runtime.
 *
 * The registry is the **single** source of truth — all other layers
 * (catalog, node builder, serializer) derive from it.
 */
export type RepoComponentDef = {
  name: string
  version?: number
  displayName?: string
  description?: string
  props: RepoComponentPropDef[]
  hasChildren: boolean
  kind: "flow" | "text"
  /** Where the definition originated. */
  source: "config" | "adapter" | "merged"
  capabilities?: RepoComponentCapabilityFlags
}

// ---------------------------------------------------------------------------
// Capability flag derivation
// ---------------------------------------------------------------------------

/**
 * Derive capability flags from a component definition.
 *
 * Rules:
 * - `inline`  — true when `kind === "text"`.
 * - `media`   — true when any prop has `type === "image"`.
 * - `configurable` — true when `props.length > 0`.
 */
export function deriveCapabilities(props: RepoComponentPropDef[], kind: "flow" | "text"): RepoComponentCapabilityFlags {
  return {
    inline: kind === "text",
    media: props.some((p) => p.type === "image"),
    configurable: props.length > 0,
  }
}

// ---------------------------------------------------------------------------
// Config / Adapter input shapes (loose — match existing Convex `v.any()`)
// ---------------------------------------------------------------------------

/** Shape coming from `repopress.config.json` → `project.components`. */
export type ConfigComponentEntry = {
  props?: Array<{
    name: string
    type: string
    label?: string
    default?: unknown
  }>
  hasChildren?: boolean
  kind?: "flow" | "text"
  version?: number
  displayName?: string
  description?: string
}

/** Shape coming from adapter discovery (minimal). */
export type AdapterComponentEntry = {
  props?: Array<{ name: string; type: string }>
  hasChildren?: boolean
  kind?: "flow" | "text"
}

/**
 * Hybrid fallback schemas for common components when adapter metadata is
 * function-only and project config schema has not synced yet.
 *
 * These keep insertion UX usable for legacy projects while schema-first
 * remains the preferred path.
 */
const KNOWN_ADAPTER_FALLBACKS: Record<string, ConfigComponentEntry> = {
  DocsImage: {
    props: [
      { name: "src", type: "image", label: "Source" },
      { name: "alt", type: "string", label: "Alt text" },
      { name: "caption", type: "string", label: "Caption" },
    ],
    hasChildren: false,
    kind: "flow",
    displayName: "Docs Image",
    description: "Documentation image with optional caption.",
  },
  DocsVideo: {
    props: [
      { name: "src", type: "string", label: "Video URL" },
      { name: "title", type: "string", label: "Title" },
    ],
    hasChildren: false,
    kind: "flow",
    displayName: "Docs Video",
    description: "Documentation video embed (YouTube/direct URL).",
  },
  Callout: {
    props: [
      { name: "type", type: "string", label: "Type", default: "info" },
      { name: "title", type: "string", label: "Title" },
    ],
    hasChildren: true,
    kind: "flow",
    displayName: "Callout",
    description: "Highlighted callout block with optional title.",
  },
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether an adapter entry is a schema object (with props/hasChildren/kind)
 * or a bare React component function. Adapter `components` from `RepoPressPreviewAdapter`
 * are `Record<string, React.ComponentType>` — i.e. functions, not schema objects.
 *
 * When the entry is a function, we treat it as a component-existence signal only:
 * the name goes into the registry, but props/hasChildren/kind use defaults.
 */
function isSchemaObject(entry: unknown): entry is AdapterComponentEntry {
  return entry !== null && typeof entry === "object" && !Array.isArray(entry) && typeof entry !== "function"
}

function hasAdapterSchema(entry: AdapterComponentEntry | undefined): boolean {
  if (!entry) return false
  if (entry.kind !== undefined) return true
  if (entry.hasChildren !== undefined) return true
  return Array.isArray(entry.props) && entry.props.length > 0
}

function normalizePropType(raw: string): RepoComponentPropType {
  const valid: RepoComponentPropType[] = ["string", "number", "boolean", "expression", "image"]
  return valid.includes(raw as RepoComponentPropType) ? (raw as RepoComponentPropType) : "string"
}

function normalizeProps(
  raw?: Array<{
    name: string
    type: string
    label?: string
    default?: unknown
  }>,
): RepoComponentPropDef[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.map((p) => ({
    name: p.name,
    type: normalizePropType(p.type),
    ...(p.label !== undefined ? { label: p.label } : {}),
    ...(p.default !== undefined ? { default: p.default } : {}),
  }))
}

// ---------------------------------------------------------------------------
// Build registry
// ---------------------------------------------------------------------------

/**
 * Build a unified component registry by merging adapter-discovered components
 * with project-level config components.
 *
 * Merge strategy (per component name):
 * - Config-only   → `source: "config"`.
 * - Adapter-only  → `source: "adapter"`.
 * - Both present  → config wins for props/hasChildren/kind, `source: "merged"`.
 *
 * Adapter components may be either schema objects (`AdapterComponentEntry`)
 * or bare React component functions (`React.ComponentType`). When a function
 * is encountered, we treat it as an existence signal only — the name enters
 * the registry with default props/hasChildren/kind, and config (if present)
 * takes precedence for schema metadata.
 *
 * Registry keys are component names (PascalCase by convention).
 */
export function buildComponentRegistry(
  adapterComponents?: Record<string, AdapterComponentEntry | unknown> | null,
  projectComponents?: Record<string, ConfigComponentEntry> | null,
): Record<string, RepoComponentDef> {
  const registry: Record<string, RepoComponentDef> = {}

  const adapterNames = new Set(Object.keys(adapterComponents ?? {}))
  const configNames = new Set(Object.keys(projectComponents ?? {}))
  const allNames = new Set([...adapterNames, ...configNames])

  for (const name of allNames) {
    const rawAdapter = adapterComponents?.[name]
    const fromConfig = projectComponents?.[name]

    // Normalize adapter entry: bare functions become empty schema objects
    const fromAdapter: AdapterComponentEntry | undefined = rawAdapter
      ? isSchemaObject(rawAdapter)
        ? rawAdapter
        : {} // React function → existence-only, no schema metadata
      : undefined

    const fallback = !fromConfig && !hasAdapterSchema(fromAdapter) ? KNOWN_ADAPTER_FALLBACKS[name] : undefined

    let source: RepoComponentDef["source"]
    if (fromConfig && fromAdapter !== undefined) {
      source = "merged"
    } else if (fromConfig) {
      source = "config"
    } else {
      source = "adapter"
    }

    // Config takes precedence when both exist
    const primary = fromConfig ?? fallback ?? fromAdapter
    if (!primary) continue

    const props = normalizeProps(
      (fromConfig?.props as RepoComponentPropDef[]) ??
        (fallback?.props as RepoComponentPropDef[]) ??
        (fromAdapter?.props as RepoComponentPropDef[]),
    )
    const kind: "flow" | "text" = primary.kind ?? "flow"
    const hasChildren = primary.hasChildren ?? true

    const def: RepoComponentDef = {
      name,
      props,
      hasChildren,
      kind,
      source,
      capabilities: deriveCapabilities(props, kind),
    }

    // Propagate optional metadata from config
    if (fromConfig?.version !== undefined) def.version = fromConfig.version
    if (fromConfig?.displayName !== undefined) def.displayName = fromConfig.displayName
    if (fromConfig?.description !== undefined) def.description = fromConfig.description
    if (!fromConfig && fallback?.version !== undefined) def.version = fallback.version
    if (!fromConfig && fallback?.displayName !== undefined) def.displayName = fallback.displayName
    if (!fromConfig && fallback?.description !== undefined) def.description = fallback.description

    registry[name] = def
  }

  return registry
}
