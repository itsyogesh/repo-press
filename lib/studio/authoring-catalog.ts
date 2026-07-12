export type AuthoringPropType = "string" | "number" | "boolean" | "expression" | "image"

export type AuthoringProp = {
  name: string
  type: AuthoringPropType
  label?: string
  default?: unknown
  required?: boolean
  description?: string
  options?: string[]
  placeholder?: string
}

export type AuthoringSlot = {
  name: string
  accepts: "text" | "markdown" | "mdx" | "components"
  required?: boolean
}

export type AuthoringProvenance = {
  source: "native" | "registry" | "manual"
  registryItem?: string
  version?: string
  integrity?: string
}

export type AuthoringComponent = {
  logicalId: string
  mdxName: string
  displayName: string
  description?: string
  category?: string
  runtime: "client" | "server" | "astro"
  schemaStatus: "complete" | "incomplete"
  props: AuthoringProp[]
  slots: AuthoringSlot[]
  previewFixtures: string[]
  provenance: AuthoringProvenance
  /** MDX editor placement metadata; declarative and framework-neutral. */
  kind: "flow" | "text"
}

export type AuthoringCatalog = AuthoringComponent[]

export type AuthoringComponentMetadata = {
  logicalId?: string
  displayName?: string
  description?: string
  category?: string
  runtime?: AuthoringComponent["runtime"]
  schemaStatus?: AuthoringComponent["schemaStatus"]
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
  slots?: AuthoringSlot[]
  previewFixtures?: string[]
  provenance?: AuthoringProvenance
  /** Legacy authoring metadata. Converted to a single MDX children slot. */
  hasChildren?: boolean
  /** Legacy MDX editor placement metadata. */
  kind?: "flow" | "text"
}

export type BuildAuthoringCatalogInput = {
  /** Names discovered by the native runtime. Values/bindings are forbidden. */
  nativeComponentNames?: readonly string[] | null
  /** Serializable authoring metadata from config, registry, or manifests. */
  metadata?: Readonly<Record<string, AuthoringComponentMetadata>> | null
  /** Accepted only to keep callers source-compatible; never used for guessing. */
  framework?: string
}

const PROP_TYPES: readonly AuthoringPropType[] = ["string", "number", "boolean", "expression", "image"]

function normalizePropType(type: string): AuthoringPropType {
  return PROP_TYPES.includes(type as AuthoringPropType) ? (type as AuthoringPropType) : "string"
}

function projectProps(props: AuthoringComponentMetadata["props"]): AuthoringProp[] {
  return (props ?? []).map((prop) => ({
    name: prop.name,
    type: normalizePropType(prop.type),
    ...(prop.label !== undefined ? { label: prop.label } : {}),
    ...(prop.default !== undefined ? { default: prop.default } : {}),
    ...(prop.required !== undefined ? { required: prop.required } : {}),
    ...(prop.description !== undefined ? { description: prop.description } : {}),
    ...(prop.options !== undefined ? { options: [...prop.options] } : {}),
    ...(prop.placeholder !== undefined ? { placeholder: prop.placeholder } : {}),
  }))
}

function projectSlots(metadata: AuthoringComponentMetadata): AuthoringSlot[] {
  if (metadata.slots) {
    return metadata.slots.map((slot) => ({
      name: slot.name,
      accepts: slot.accepts,
      ...(slot.required !== undefined ? { required: slot.required } : {}),
    }))
  }
  return metadata.hasChildren ? [{ name: "children", accepts: "mdx" }] : []
}

function projectProvenance(provenance: AuthoringProvenance): AuthoringProvenance {
  return {
    source: provenance.source,
    ...(provenance.registryItem !== undefined ? { registryItem: provenance.registryItem } : {}),
    ...(provenance.version !== undefined ? { version: provenance.version } : {}),
    ...(provenance.integrity !== undefined ? { integrity: provenance.integrity } : {}),
  }
}

function assertSerializable(value: unknown, path = "catalog"): void {
  if (value === undefined) return
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "number" && Number.isFinite(value)) return
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSerializable(item, `${path}[${index}]`)
    })
    return
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) assertSerializable(item, `${path}.${key}`)
    return
  }
  throw new TypeError(`Authoring catalog metadata at ${path} must be serializable`)
}

/** Build Studio state exclusively from names and declarative metadata. */
export function buildAuthoringCatalog(input: BuildAuthoringCatalogInput): AuthoringCatalog {
  const nativeNames = new Set(input.nativeComponentNames ?? [])
  const metadataNames = Object.keys(input.metadata ?? {})
  const names = new Set([...nativeNames, ...metadataNames])

  const catalog = Array.from(names, (mdxName): AuthoringComponent => {
    const metadata = input.metadata?.[mdxName]
    if (!metadata) {
      return {
        logicalId: mdxName,
        mdxName,
        displayName: mdxName,
        runtime: "server",
        schemaStatus: "incomplete",
        props: [],
        slots: [],
        previewFixtures: [],
        provenance: { source: "native" },
        kind: "flow",
      }
    }

    return {
      logicalId: metadata.logicalId ?? mdxName,
      mdxName,
      displayName: metadata.displayName ?? mdxName,
      ...(metadata.description !== undefined ? { description: metadata.description } : {}),
      ...(metadata.category !== undefined ? { category: metadata.category } : {}),
      runtime: metadata.runtime ?? "client",
      schemaStatus: metadata.schemaStatus ?? "complete",
      props: projectProps(metadata.props),
      slots: projectSlots(metadata),
      previewFixtures: [...(metadata.previewFixtures ?? [])],
      provenance: metadata.provenance ? projectProvenance(metadata.provenance) : { source: "manual" },
      kind: metadata.kind ?? "flow",
    }
  }).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.mdxName.localeCompare(b.mdxName))

  assertSerializable(catalog)
  return catalog
}

export function componentAcceptsChildren(component: AuthoringComponent): boolean {
  return component.slots.some((slot) => slot.name === "children")
}
