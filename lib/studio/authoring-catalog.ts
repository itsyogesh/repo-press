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

export type AuthoringAsset = { path: string; type: "image" | "style" | "font" | "file" }

export type AuthoringComponent = {
  logicalId: string
  mdxName: string
  displayName: string
  description?: string
  category?: string
  version?: string
  assets?: AuthoringAsset[]
  import?: { source: string; exportName: string }
  frameworks?: Array<"next" | "fumadocs" | "astro">
  runtime: "client" | "server" | "astro"
  schemaStatus: "complete" | "incomplete"
  props: AuthoringProp[]
  slots: AuthoringSlot[]
  previewFixtures: string[]
  provenance: AuthoringProvenance
  kind: "flow" | "text"
}

export type AuthoringCatalog = AuthoringComponent[]

export type AuthoringComponentMetadata = {
  logicalId?: string
  displayName?: string
  description?: string
  category?: string
  version?: string
  assets?: AuthoringAsset[]
  import?: { source: string; exportName: string }
  frameworks?: Array<"next" | "fumadocs" | "astro">
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
  hasChildren?: boolean
  kind?: "flow" | "text"
}

export type BuildAuthoringCatalogInput = {
  nativeComponentNames?: readonly string[] | null
  metadata?: Readonly<Record<string, AuthoringComponentMetadata>> | null
  /** Compatibility-only. Framework names never select authoring schemas. */
  framework?: string
}

export const AUTHORING_CATALOG_LIMITS = Object.freeze({
  maxDepth: 32,
  maxNodes: 10_000,
  maxUtf8Bytes: 256 * 1024,
  maxComponents: 512,
  maxPropsPerComponent: 128,
  maxOptionsPerProp: 256,
  maxSlotsPerComponent: 64,
  maxFixturesPerComponent: 128,
  maxAssetsPerComponent: 128,
})

const PROP_TYPES: readonly AuthoringPropType[] = ["string", "number", "boolean", "expression", "image"]
const RUNTIMES = new Set(["client", "server", "astro"])
const SLOT_ACCEPTS = new Set(["text", "markdown", "mdx", "components"])
const PROVENANCE_SOURCES = new Set(["native", "registry", "manual"])
const HAZARDOUS_NAMES = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "toString",
  "valueOf",
  "dangerouslySetInnerHTML",
])
const MDX_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/
const FIELD_NAME = /^[A-Za-z_$][A-Za-z0-9_$-]*$/
const LOGICAL_ID = /^[A-Za-z0-9_$@][A-Za-z0-9_$@./:-]*$/
const validatedCatalogs = new WeakSet<object>()

function ownValue(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor) return undefined
  if (!("value" in descriptor)) throw new TypeError(`Authoring metadata field ${key} must not be an accessor`)
  return descriptor.value
}

function hasOwn(object: object, key: string): boolean {
  return Object.hasOwn(object, key)
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new TypeError(`${path} must be a string`)
  return value
}

function optionalString(object: object, key: string, path: string): string | undefined {
  const value = ownValue(object, key)
  return value === undefined ? undefined : requireString(value, path)
}

function assertSafeSegments(value: string, label: string): void {
  if (value.split(/[.:/]/).some((segment) => HAZARDOUS_NAMES.has(segment))) {
    throw new TypeError(`Unsafe ${label}: ${value}`)
  }
}

function validateMdxName(value: string): void {
  if (!MDX_NAME.test(value)) throw new TypeError(`Invalid MDX name: ${value}`)
  assertSafeSegments(value, "MDX name")
}

export function assertSafeMdxName(value: string): void {
  validateMdxName(value)
}

function validateLogicalId(value: string): void {
  if (!LOGICAL_ID.test(value)) throw new TypeError(`Invalid logical ID: ${value}`)
  assertSafeSegments(value, "logical ID")
}

function validateFieldName(value: string, label: "prop name" | "slot name"): void {
  if (!FIELD_NAME.test(value) || HAZARDOUS_NAMES.has(value)) throw new TypeError(`Invalid ${label}: ${value}`)
}

export function assertSafeAuthoringPropName(value: string): void {
  validateFieldName(value, "prop name")
}

function requireDataObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${path} must be an object`)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must be a plain object`)
  return value as Record<string, unknown>
}

function arrayDataValue(array: readonly unknown[], index: number, path: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(array, String(index))
  if (!descriptor || !("value" in descriptor)) throw new TypeError(`${path}[${index}] must be an own data descriptor`)
  if (descriptor.value === undefined) throw new TypeError(`${path}[${index}] must not be undefined`)
  return descriptor.value
}

function normalizePropType(type: string): AuthoringPropType {
  return PROP_TYPES.includes(type as AuthoringPropType) ? (type as AuthoringPropType) : "string"
}

function projectProps(metadata: Record<string, unknown>): AuthoringProp[] {
  const value = ownValue(metadata, "props")
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new TypeError("Authoring props must be an array")
  if (value.length > AUTHORING_CATALOG_LIMITS.maxPropsPerComponent) {
    throw new TypeError("Authoring catalog exceeds prop count limit")
  }
  const names = new Set<string>()
  const result: AuthoringProp[] = []
  for (let index = 0; index < value.length; index += 1) {
    const rawProp = arrayDataValue(value, index, "props")
    const prop = requireDataObject(rawProp, `props[${index}]`)
    const name = requireString(ownValue(prop, "name"), `props[${index}].name`)
    validateFieldName(name, "prop name")
    if (names.has(name)) throw new TypeError(`Authoring catalog has duplicate prop name: ${name}`)
    names.add(name)
    const type = normalizePropType(requireString(ownValue(prop, "type"), `props[${index}].type`))
    const options = ownValue(prop, "options")
    if (options !== undefined && !Array.isArray(options)) {
      throw new TypeError(`props[${index}].options must be a string array`)
    }
    if (Array.isArray(options) && options.length > AUTHORING_CATALOG_LIMITS.maxOptionsPerProp) {
      throw new TypeError("Authoring catalog exceeds option count limit")
    }
    const projectedOptions: string[] = []
    if (Array.isArray(options)) {
      for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
        const option = arrayDataValue(options, optionIndex, `props[${index}].options`)
        if (typeof option !== "string") throw new TypeError(`props[${index}].options must be a string array`)
        projectedOptions.push(option)
      }
    }
    const required = ownValue(prop, "required")
    if (required !== undefined && typeof required !== "boolean")
      throw new TypeError(`props[${index}].required must be boolean`)
    result.push({
      name,
      type,
      ...(optionalString(prop, "label", `props[${index}].label`) !== undefined
        ? { label: optionalString(prop, "label", `props[${index}].label`) }
        : {}),
      ...(hasOwn(prop, "default") && ownValue(prop, "default") !== undefined
        ? { default: ownValue(prop, "default") }
        : {}),
      ...(required !== undefined ? { required } : {}),
      ...(optionalString(prop, "description", `props[${index}].description`) !== undefined
        ? { description: optionalString(prop, "description", `props[${index}].description`) }
        : {}),
      ...(options !== undefined ? { options: projectedOptions } : {}),
      ...(optionalString(prop, "placeholder", `props[${index}].placeholder`) !== undefined
        ? { placeholder: optionalString(prop, "placeholder", `props[${index}].placeholder`) }
        : {}),
    })
  }
  return result
}

function projectSlots(metadata: Record<string, unknown>): AuthoringSlot[] {
  const value = ownValue(metadata, "slots")
  if (value === undefined) {
    const hasChildren = ownValue(metadata, "hasChildren")
    if (hasChildren !== undefined && typeof hasChildren !== "boolean")
      throw new TypeError("hasChildren must be boolean")
    return hasChildren === true ? [{ name: "children", accepts: "mdx" }] : []
  }
  if (!Array.isArray(value)) throw new TypeError("Authoring slots must be an array")
  if (value.length > AUTHORING_CATALOG_LIMITS.maxSlotsPerComponent) {
    throw new TypeError("Authoring catalog exceeds slot count limit")
  }
  const names = new Set<string>()
  const result: AuthoringSlot[] = []
  for (let index = 0; index < value.length; index += 1) {
    const rawSlot = arrayDataValue(value, index, "slots")
    const slot = requireDataObject(rawSlot, `slots[${index}]`)
    const name = requireString(ownValue(slot, "name"), `slots[${index}].name`)
    validateFieldName(name, "slot name")
    if (names.has(name)) throw new TypeError(`Authoring catalog has duplicate slot name: ${name}`)
    names.add(name)
    const accepts = requireString(ownValue(slot, "accepts"), `slots[${index}].accepts`)
    if (!SLOT_ACCEPTS.has(accepts)) throw new TypeError(`Invalid slot acceptance: ${accepts}`)
    const required = ownValue(slot, "required")
    if (required !== undefined && typeof required !== "boolean")
      throw new TypeError(`slots[${index}].required must be boolean`)
    result.push({ name, accepts: accepts as AuthoringSlot["accepts"], ...(required !== undefined ? { required } : {}) })
  }
  return result
}

function projectProvenance(metadata: Record<string, unknown>): AuthoringProvenance {
  const raw = ownValue(metadata, "provenance")
  if (raw === undefined) return { source: "manual" }
  const provenance = requireDataObject(raw, "provenance")
  const source = requireString(ownValue(provenance, "source"), "provenance.source")
  if (!PROVENANCE_SOURCES.has(source)) throw new TypeError(`Invalid provenance source: ${source}`)
  return {
    source: source as AuthoringProvenance["source"],
    ...(optionalString(provenance, "registryItem", "provenance.registryItem") !== undefined
      ? { registryItem: optionalString(provenance, "registryItem", "provenance.registryItem") }
      : {}),
    ...(optionalString(provenance, "version", "provenance.version") !== undefined
      ? { version: optionalString(provenance, "version", "provenance.version") }
      : {}),
    ...(optionalString(provenance, "integrity", "provenance.integrity") !== undefined
      ? { integrity: optionalString(provenance, "integrity", "provenance.integrity") }
      : {}),
  }
}

function projectAssets(metadata: Record<string, unknown>): AuthoringAsset[] | undefined {
  const value = ownValue(metadata, "assets")
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new TypeError("assets must be an array")
  if (value.length > AUTHORING_CATALOG_LIMITS.maxAssetsPerComponent) {
    throw new TypeError("Authoring catalog exceeds asset count limit")
  }
  const paths = new Set<string>()
  const assets: AuthoringAsset[] = []
  for (let index = 0; index < value.length; index += 1) {
    const asset = requireDataObject(arrayDataValue(value, index, "assets"), `assets[${index}]`)
    const path = requireString(ownValue(asset, "path"), `assets[${index}].path`)
    const type = requireString(ownValue(asset, "type"), `assets[${index}].type`)
    if (!new Set(["image", "style", "font", "file"]).has(type)) throw new TypeError(`Invalid asset type: ${type}`)
    if (paths.has(path)) throw new TypeError(`Authoring catalog has duplicate asset path: ${path}`)
    paths.add(path)
    assets.push({ path, type: type as AuthoringAsset["type"] })
  }
  return assets
}

function projectImport(metadata: Record<string, unknown>): AuthoringComponent["import"] {
  const value = ownValue(metadata, "import")
  if (value === undefined) return undefined
  const declaration = requireDataObject(value, "import")
  const source = requireString(ownValue(declaration, "source"), "import.source")
  const exportName = requireString(ownValue(declaration, "exportName"), "import.exportName")
  validateMdxName(exportName)
  return { source, exportName }
}

function projectFrameworks(metadata: Record<string, unknown>): AuthoringComponent["frameworks"] {
  const value = ownValue(metadata, "frameworks")
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 3) throw new TypeError("frameworks must be a bounded array")
  const frameworks: Array<"next" | "fumadocs" | "astro"> = []
  for (let index = 0; index < value.length; index += 1) {
    const framework = arrayDataValue(value, index, "frameworks")
    if (framework !== "next" && framework !== "fumadocs" && framework !== "astro") {
      throw new TypeError(`Invalid authoring framework: ${String(framework)}`)
    }
    if (frameworks.includes(framework)) throw new TypeError(`Duplicate authoring framework: ${framework}`)
    frameworks.push(framework)
  }
  return frameworks
}

type CloneState = { nodes: number; bytes: number; active: WeakSet<object> }

function addUtf8Bytes(value: string, state: CloneState): void {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index) ?? 0
    state.bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
    if (codePoint > 0xffff) index += 1
    if (state.bytes > AUTHORING_CATALOG_LIMITS.maxUtf8Bytes) throw new TypeError("Authoring catalog exceeds byte limit")
  }
}

function preflightJson(value: unknown, state: CloneState, depth = 0, path = "catalog"): void {
  if (depth > AUTHORING_CATALOG_LIMITS.maxDepth) throw new TypeError("Authoring catalog exceeds depth limit")
  state.nodes += 1
  if (state.nodes > AUTHORING_CATALOG_LIMITS.maxNodes) throw new TypeError("Authoring catalog exceeds node limit")
  if (value === undefined) throw new TypeError(`Authoring catalog contains undefined at ${path}`)
  if (value === null || typeof value === "boolean") return
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Authoring catalog value at ${path} must be serializable`)
    return
  }
  if (typeof value === "string") {
    addUtf8Bytes(value, state)
    return
  }
  if (typeof value !== "object") throw new TypeError(`Authoring catalog value at ${path} must be serializable`)
  if (state.active.has(value)) throw new TypeError(`Authoring catalog contains a cycle at ${path}`)
  state.active.add(value)
  if (Array.isArray(value)) {
    if (value.length > AUTHORING_CATALOG_LIMITS.maxNodes - state.nodes) {
      throw new TypeError("Authoring catalog exceeds node limit")
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError(`Authoring catalog contains undefined at ${path}[${index}]`)
      preflightJson(value[index], state, depth + 1, `${path}[${index}]`)
    }
  } else {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Authoring catalog value at ${path} must be serializable`)
    }
    for (const key of Object.keys(value)) {
      if (HAZARDOUS_NAMES.has(key)) throw new TypeError(`Unsafe object key at ${path}.${key}`)
      addUtf8Bytes(key, state)
      preflightJson(ownValue(value, key), state, depth + 1, `${path}.${key}`)
    }
  }
  state.active.delete(value)
}

function cloneJson(value: unknown, state: CloneState, depth = 0, path = "catalog"): unknown {
  if (depth > AUTHORING_CATALOG_LIMITS.maxDepth) throw new TypeError("Authoring catalog exceeds depth limit")
  state.nodes += 1
  if (state.nodes > AUTHORING_CATALOG_LIMITS.maxNodes) throw new TypeError("Authoring catalog exceeds node limit")
  if (value === undefined) throw new TypeError(`Authoring catalog contains undefined at ${path}`)
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Authoring catalog value at ${path} must be serializable`)
    return value
  }
  if (typeof value === "string") {
    state.bytes += new TextEncoder().encode(value).byteLength
    if (state.bytes > AUTHORING_CATALOG_LIMITS.maxUtf8Bytes) throw new TypeError("Authoring catalog exceeds byte limit")
    return value
  }
  if (typeof value !== "object") throw new TypeError(`Authoring catalog value at ${path} must be serializable`)
  if (state.active.has(value)) throw new TypeError(`Authoring catalog contains a cycle at ${path}`)
  state.active.add(value)
  let clone: unknown
  if (Array.isArray(value)) {
    clone = Array.from({ length: value.length }, (_, index) => {
      if (!Object.hasOwn(value, index)) throw new TypeError(`Authoring catalog contains undefined at ${path}[${index}]`)
      return cloneJson(value[index], state, depth + 1, `${path}[${index}]`)
    })
  } else {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Authoring catalog value at ${path} must be serializable`)
    }
    const object = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(object)) {
      if (HAZARDOUS_NAMES.has(key)) throw new TypeError(`Unsafe object key at ${path}.${key}`)
      state.bytes += new TextEncoder().encode(key).byteLength
      if (state.bytes > AUTHORING_CATALOG_LIMITS.maxUtf8Bytes)
        throw new TypeError("Authoring catalog exceeds byte limit")
      result[key] = cloneJson(ownValue(object, key), state, depth + 1, `${path}.${key}`)
    }
    clone = result
  }
  state.active.delete(value)
  return Object.freeze(clone)
}

function cloneAndFreezeCatalog(catalog: AuthoringCatalog): AuthoringCatalog {
  preflightJson(catalog, { nodes: 0, bytes: 0, active: new WeakSet() })
  const result = cloneJson(catalog, { nodes: 0, bytes: 0, active: new WeakSet() }) as AuthoringCatalog
  validatedCatalogs.add(result)
  return result
}

export function isValidatedAuthoringCatalog(value: unknown): value is AuthoringCatalog {
  return typeof value === "object" && value !== null && validatedCatalogs.has(value)
}

function metadataFor(
  map: Readonly<Record<string, AuthoringComponentMetadata>>,
  name: string,
): Record<string, unknown> | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(map, name)
  if (!descriptor) return undefined
  if (!("value" in descriptor)) throw new TypeError(`Authoring metadata for ${name} must not be an accessor`)
  return requireDataObject(descriptor.value, `metadata.${name}`)
}

function schemaStatus(metadata: Record<string, unknown>): AuthoringComponent["schemaStatus"] {
  const declaredStatus = ownValue(metadata, "schemaStatus")
  if (declaredStatus !== undefined && declaredStatus !== "complete" && declaredStatus !== "incomplete") {
    throw new TypeError(`Invalid schema status: ${String(declaredStatus)}`)
  }
  if (declaredStatus === "incomplete") return "incomplete"
  const declaresProps = hasOwn(metadata, "props") && Array.isArray(ownValue(metadata, "props"))
  const declaresSlots =
    (hasOwn(metadata, "slots") && Array.isArray(ownValue(metadata, "slots"))) ||
    (hasOwn(metadata, "hasChildren") && typeof ownValue(metadata, "hasChildren") === "boolean")
  return declaresProps && declaresSlots ? "complete" : "incomplete"
}

export function buildAuthoringCatalog(input: BuildAuthoringCatalogInput): AuthoringCatalog {
  const metadataMap = input.metadata ?? {}
  if (!Array.isArray(input.nativeComponentNames ?? [])) throw new TypeError("nativeComponentNames must be an array")
  if ((input.nativeComponentNames?.length ?? 0) > AUTHORING_CATALOG_LIMITS.maxComponents) {
    throw new TypeError("Authoring catalog exceeds component count limit")
  }
  requireDataObject(metadataMap, "metadata")
  const names = new Set<string>()
  const nativeComponentNames = input.nativeComponentNames ?? []
  for (let index = 0; index < nativeComponentNames.length; index += 1) {
    const name = arrayDataValue(nativeComponentNames, index, "nativeComponentNames")
    if (typeof name !== "string") throw new TypeError(`nativeComponentNames[${index}] must be a string`)
    validateMdxName(name)
    names.add(name)
  }
  let metadataCount = 0
  for (const name in metadataMap) {
    if (!Object.hasOwn(metadataMap, name)) continue
    metadataCount += 1
    if (metadataCount > AUTHORING_CATALOG_LIMITS.maxComponents) {
      throw new TypeError("Authoring catalog exceeds component count limit")
    }
    validateMdxName(name)
    names.add(name)
  }
  if (names.size > AUTHORING_CATALOG_LIMITS.maxComponents) {
    throw new TypeError("Authoring catalog exceeds component count limit")
  }

  const logicalIds = new Set<string>()
  const catalog = Array.from(names, (mdxName): AuthoringComponent => {
    const metadata = metadataFor(metadataMap, mdxName)
    if (!metadata) {
      if (logicalIds.has(mdxName)) throw new TypeError(`Authoring catalog has duplicate logical ID: ${mdxName}`)
      logicalIds.add(mdxName)
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

    const logicalId = optionalString(metadata, "logicalId", "logical ID") ?? mdxName
    validateLogicalId(logicalId)
    if (logicalIds.has(logicalId)) throw new TypeError(`Authoring catalog has duplicate logical ID: ${logicalId}`)
    logicalIds.add(logicalId)
    const runtime = ownValue(metadata, "runtime") ?? "client"
    if (typeof runtime !== "string" || !RUNTIMES.has(runtime))
      throw new TypeError(`Invalid authoring runtime: ${String(runtime)}`)
    const kind = ownValue(metadata, "kind") ?? "flow"
    if (kind !== "flow" && kind !== "text") throw new TypeError(`Invalid authoring kind: ${String(kind)}`)
    const fixtures = ownValue(metadata, "previewFixtures") ?? []
    if (!Array.isArray(fixtures)) {
      throw new TypeError("previewFixtures must be a string array")
    }
    if (fixtures.length > AUTHORING_CATALOG_LIMITS.maxFixturesPerComponent) {
      throw new TypeError("Authoring catalog exceeds fixture count limit")
    }
    const projectedFixtures: string[] = []
    for (let fixtureIndex = 0; fixtureIndex < fixtures.length; fixtureIndex += 1) {
      const fixture = arrayDataValue(fixtures, fixtureIndex, "previewFixtures")
      if (typeof fixture !== "string") throw new TypeError("previewFixtures must be a string array")
      projectedFixtures.push(fixture)
    }
    const version = optionalString(metadata, "version", "version")
    const assets = projectAssets(metadata)
    const importDeclaration = projectImport(metadata)
    const frameworks = projectFrameworks(metadata)
    return {
      logicalId,
      mdxName,
      displayName: optionalString(metadata, "displayName", "displayName") ?? mdxName,
      ...(optionalString(metadata, "description", "description") !== undefined
        ? { description: optionalString(metadata, "description", "description") }
        : {}),
      ...(optionalString(metadata, "category", "category") !== undefined
        ? { category: optionalString(metadata, "category", "category") }
        : {}),
      ...(version !== undefined ? { version } : {}),
      ...(assets !== undefined ? { assets } : {}),
      ...(importDeclaration !== undefined ? { import: importDeclaration } : {}),
      ...(frameworks !== undefined ? { frameworks } : {}),
      runtime: runtime as AuthoringComponent["runtime"],
      schemaStatus: schemaStatus(metadata),
      props: projectProps(metadata),
      slots: projectSlots(metadata),
      previewFixtures: projectedFixtures,
      provenance: projectProvenance(metadata),
      kind,
    }
  })

  // Reject hostile strings/defaults before locale sorting or clone allocation.
  preflightJson(catalog, { nodes: 0, bytes: 0, active: new WeakSet() })
  catalog.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.mdxName.localeCompare(b.mdxName))
  return cloneAndFreezeCatalog(catalog)
}

export function componentAcceptsChildren(component: AuthoringComponent): boolean {
  return component.slots.some((slot) => slot.name === "children")
}

export function extendAuthoringCatalogWithNativeNames(
  catalog: AuthoringCatalog,
  nativeComponentNames: readonly string[],
): AuthoringCatalog {
  if (!isValidatedAuthoringCatalog(catalog)) throw new TypeError("Base authoring catalog must be validated")
  if (nativeComponentNames.length > AUTHORING_CATALOG_LIMITS.maxComponents) {
    throw new TypeError("Authoring catalog exceeds component count limit")
  }
  const existingNames = new Set(catalog.map((component) => component.mdxName))
  const additions = buildAuthoringCatalog({
    nativeComponentNames: nativeComponentNames.filter((name) => !existingNames.has(name)),
  })
  const logicalIds = new Set(catalog.map((component) => component.logicalId))
  for (const component of additions) {
    if (logicalIds.has(component.logicalId)) {
      throw new TypeError(`Authoring catalog has duplicate logical ID: ${component.logicalId}`)
    }
    logicalIds.add(component.logicalId)
  }
  if (catalog.length + additions.length > AUTHORING_CATALOG_LIMITS.maxComponents) {
    throw new TypeError("Authoring catalog exceeds component count limit")
  }
  return cloneAndFreezeCatalog(
    [...catalog, ...additions].sort(
      (a, b) => a.displayName.localeCompare(b.displayName) || a.mdxName.localeCompare(b.mdxName),
    ),
  )
}
