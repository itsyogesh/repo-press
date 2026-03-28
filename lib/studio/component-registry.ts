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
  required?: boolean
  description?: string
  options?: string[]
  placeholder?: string
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
    required?: boolean
    description?: string
    options?: string[]
    placeholder?: string
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
 * Returns framework-appropriate fallback component schemas when adapter
 * metadata is function-only and project config schema has not synced yet.
 *
 * These keep insertion UX usable for any connected repo while schema-first
 * remains the preferred path.
 */
export function getFrameworkFallbacks(framework?: string): Record<string, ConfigComponentEntry> {
  const fw = framework?.toLowerCase() ?? ""

  // fumadocs / fumadocs-core
  if (fw.includes("fumadocs")) {
    return {
      DocsImage: {
        props: [
          { name: "src", type: "image", label: "Source", required: true },
          { name: "alt", type: "string", label: "Alt text", description: "Accessible description for screen readers" },
          { name: "caption", type: "string", label: "Caption" },
        ],
        hasChildren: false,
        kind: "flow",
        displayName: "Docs Image",
        description: "Documentation image with optional caption.",
      },
      DocsVideo: {
        props: [
          { name: "src", type: "string", label: "Video URL", required: true, placeholder: "https://youtube.com/..." },
          { name: "title", type: "string", label: "Title" },
        ],
        hasChildren: false,
        kind: "flow",
        displayName: "Docs Video",
        description: "Documentation video embed (YouTube/direct URL).",
      },
      Callout: {
        props: [
          {
            name: "type",
            type: "string",
            label: "Type",
            default: "info",
            options: ["info", "warning", "error", "tip"],
          },
          { name: "title", type: "string", label: "Title" },
        ],
        hasChildren: true,
        kind: "flow",
        displayName: "Callout",
        description: "Highlighted callout block with optional title.",
      },
    }
  }

  // nextra
  if (fw.includes("nextra")) {
    return {
      Callout: {
        props: [
          {
            name: "type",
            type: "string",
            label: "Type",
            options: ["default", "info", "warning", "error"],
            default: "default",
          },
          { name: "emoji", type: "string", label: "Emoji", placeholder: "💡" },
        ],
        hasChildren: true,
        kind: "flow",
        displayName: "Callout",
        description: "Highlighted callout block.",
      },
      Steps: {
        props: [],
        hasChildren: true,
        kind: "flow",
        displayName: "Steps",
        description: "Numbered step list.",
      },
      Card: {
        props: [
          { name: "title", type: "string", label: "Title", required: true },
          { name: "href", type: "string", label: "URL", placeholder: "/docs/page" },
          { name: "icon", type: "string", label: "Icon", placeholder: "Emoji or icon name" },
        ],
        hasChildren: true,
        kind: "flow",
        displayName: "Card",
        description: "Navigation card with link.",
      },
      Cards: {
        props: [],
        hasChildren: true,
        kind: "flow",
        displayName: "Cards",
        description: "Grid container for Card components.",
      },
      Tab: {
        props: [{ name: "label", type: "string", label: "Label", required: true }],
        hasChildren: true,
        kind: "flow",
        displayName: "Tab",
        description: "Single tab panel.",
      },
      Tabs: {
        props: [{ name: "items", type: "string", label: "Tab Labels", placeholder: '["Tab 1", "Tab 2"]' }],
        hasChildren: true,
        kind: "flow",
        displayName: "Tabs",
        description: "Tabbed content container.",
      },
    }
  }

  // astro / starlight
  if (fw.includes("astro") || fw.includes("starlight")) {
    return {
      Aside: {
        props: [
          {
            name: "type",
            type: "string",
            label: "Type",
            options: ["note", "tip", "caution", "danger"],
            default: "note",
          },
          { name: "title", type: "string", label: "Title", placeholder: "Optional title" },
        ],
        hasChildren: true,
        kind: "flow",
        displayName: "Aside",
        description: "Callout block (note, tip, caution, danger).",
      },
      Card: {
        props: [
          { name: "title", type: "string", label: "Title", required: true },
          { name: "icon", type: "string", label: "Icon", placeholder: "rocket" },
        ],
        hasChildren: true,
        kind: "flow",
        displayName: "Card",
        description: "Feature or content card.",
      },
      CardGrid: {
        props: [{ name: "stagger", type: "boolean", label: "Stagger animation" }],
        hasChildren: true,
        kind: "flow",
        displayName: "Card Grid",
        description: "Grid layout for Card components.",
      },
      LinkCard: {
        props: [
          { name: "title", type: "string", label: "Title", required: true },
          { name: "href", type: "string", label: "URL", required: true, placeholder: "/docs/page" },
          { name: "description", type: "string", label: "Description" },
        ],
        hasChildren: false,
        kind: "flow",
        displayName: "Link Card",
        description: "Navigation card with link and description.",
      },
    }
  }

  // docusaurus
  if (fw.includes("docusaurus")) {
    return {
      Admonition: {
        props: [
          {
            name: "type",
            type: "string",
            label: "Type",
            options: ["note", "tip", "info", "caution", "danger"],
            default: "note",
          },
          { name: "title", type: "string", label: "Title", placeholder: "Optional custom title" },
        ],
        hasChildren: true,
        kind: "flow",
        displayName: "Admonition",
        description: "Highlighted note, tip, info, warning, or danger block.",
      },
      Tabs: {
        props: [{ name: "groupId", type: "string", label: "Group ID", placeholder: "Sync tabs with same group" }],
        hasChildren: true,
        kind: "flow",
        displayName: "Tabs",
        description: "Tabbed content container.",
      },
      TabItem: {
        props: [
          { name: "value", type: "string", label: "Value", required: true },
          { name: "label", type: "string", label: "Label" },
          { name: "default", type: "boolean", label: "Default tab" },
        ],
        hasChildren: true,
        kind: "flow",
        displayName: "Tab Item",
        description: "Single tab panel inside Tabs.",
      },
    }
  }

  // jekyll / hugo — markdown-first, no JSX components
  if (fw.includes("jekyll") || fw.includes("hugo")) {
    return {}
  }

  // generic / custom / contentlayer / next-mdx / unknown — safe common defaults
  return {
    Callout: {
      props: [
        {
          name: "type",
          type: "string",
          label: "Type",
          options: ["default", "info", "warning", "error"],
          default: "default",
        },
        { name: "title", type: "string", label: "Title", placeholder: "Optional title" },
      ],
      hasChildren: true,
      kind: "flow",
      displayName: "Callout",
      description: "Highlighted note or warning block.",
    },
    Image: {
      props: [
        { name: "src", type: "image", label: "Image Source", required: true },
        { name: "alt", type: "string", label: "Alt Text", required: true },
        { name: "caption", type: "string", label: "Caption" },
      ],
      hasChildren: false,
      kind: "flow",
      displayName: "Image",
      description: "Inline image with optional caption.",
    },
    Video: {
      props: [
        { name: "src", type: "string", label: "Video URL", required: true, placeholder: "https://youtube.com/..." },
        { name: "title", type: "string", label: "Title" },
      ],
      hasChildren: false,
      kind: "flow",
      displayName: "Video",
      description: "Video embed (YouTube or direct URL).",
    },
  }
}

/**
 * @deprecated Use `getFrameworkFallbacks("fumadocs")` instead.
 * Kept for backwards compatibility with existing tests and callers.
 */
export const KNOWN_ADAPTER_FALLBACKS = getFrameworkFallbacks("fumadocs")

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
    required?: boolean
    description?: string
    options?: string[]
    placeholder?: string
  }>,
): RepoComponentPropDef[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.map((p) => ({
    name: p.name,
    type: normalizePropType(p.type),
    ...(p.label !== undefined ? { label: p.label } : {}),
    ...(p.default !== undefined ? { default: p.default } : {}),
    ...(p.required !== undefined ? { required: p.required } : {}),
    ...(p.description !== undefined ? { description: p.description } : {}),
    ...(p.options !== undefined ? { options: p.options } : {}),
    ...(p.placeholder !== undefined ? { placeholder: p.placeholder } : {}),
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
  framework?: string,
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

    const frameworkFallbacks = getFrameworkFallbacks(framework)
    // When no framework is detected, also check KNOWN_ADAPTER_FALLBACKS (fumadocs-era
    // component names like DocsImage/DocsVideo) so existing projects aren't regressed.
    const fallback =
      !fromConfig && !hasAdapterSchema(fromAdapter)
        ? (frameworkFallbacks[name] ?? (framework == null ? KNOWN_ADAPTER_FALLBACKS[name] : undefined))
        : undefined

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
