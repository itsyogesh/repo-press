import { computeRegistryItemIntegrity, type RegistryIntegrityFile } from "./registry-integrity"
import {
  compareCodeUnits,
  deepFreeze,
  type NormalizedAuthoringMetadata,
  normalizeRegistryAuthoringMetadata,
  REGISTRY_LIMITS,
  type RegistryItem,
  registryItemSchema,
} from "./registry-schema"

const MAX_REGISTRY_SOURCES = 512
const MAX_RESOLUTION_DEPTH = 128
const FULL_REF = /^(?:[a-f0-9]{40}|[a-f0-9]{64}|sha256:[a-f0-9]{64})$/u
const SOURCE_REF = /^(?:[a-f0-9]{40}|[a-f0-9]{64}|(?:refs\/tags\/)?v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u

export interface RegistrySourceInput {
  reference: string
  item: unknown
  files: readonly RegistryIntegrityFile[]
  resolved: {
    address: string
    sourceRef: string
    resolvedRef: string
  }
}

export interface ResolvedRegistryItem {
  logicalId: string
  reference: string
  item: RegistryItem
  files: readonly RegistryIntegrityFile[]
  resolved: Readonly<{ address: string; sourceRef: string; resolvedRef: string }>
  integrity: string
  dependencies: readonly string[]
  authoring: NormalizedAuthoringMetadata
}

export interface ResolveRegistryItemsInput {
  requested: readonly string[]
  sources: readonly RegistrySourceInput[]
  framework: "next" | "fumadocs" | "astro"
}

function ownData(object: object, key: string, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !("value" in descriptor)) throw new TypeError(`${label} must be an own data property`)
  return descriptor.value
}

function boundedString(value: unknown, label: string, maximum = 2_048): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${label} must be a bounded non-empty string`)
  }
  return value
}

function validateResolved(input: unknown): { address: string; sourceRef: string; resolvedRef: string } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Resolved registry identity must be an object")
  const address = boundedString(ownData(input, "address", "resolved.address"), "resolved.address")
  const sourceRef = boundedString(ownData(input, "sourceRef", "resolved.sourceRef"), "resolved.sourceRef", 128)
  const resolvedRef = boundedString(ownData(input, "resolvedRef", "resolved.resolvedRef"), "resolved.resolvedRef", 128)
  let validAddress = false
  if (address.startsWith("https://")) {
    try {
      const url = new URL(address)
      validAddress = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
    } catch {
      validAddress = false
    }
  } else {
    validAddress = /^github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+$/u.test(address)
  }
  if (!validAddress || address.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new TypeError("Resolved registry address must be absolute and immutable")
  }
  if (!SOURCE_REF.test(sourceRef) || !FULL_REF.test(resolvedRef)) {
    throw new TypeError("Resolved registry refs must be immutable")
  }
  return { address, sourceRef, resolvedRef }
}

function copyFiles(input: unknown): RegistryIntegrityFile[] {
  if (!Array.isArray(input) || input.length > REGISTRY_LIMITS.maxFiles + REGISTRY_LIMITS.maxFixtures) {
    throw new TypeError("Registry source file limit exceeded")
  }
  return input.map((_, index) => {
    const entry = ownData(input, String(index), `sources.files[${index}]`)
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new TypeError("Registry source file must be an object")
    return {
      path: boundedString(ownData(entry, "path", `sources.files[${index}].path`), "Registry source path"),
      content: boundedString(
        ownData(entry, "content", `sources.files[${index}].content`),
        "Registry source content",
        16 * 1024 * 1024,
      ),
    }
  })
}

function prepareSource(input: unknown): ResolvedRegistryItem {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Registry source must be an object")
  const reference = boundedString(ownData(input, "reference", "source.reference"), "source.reference")
  const item = registryItemSchema.parse(ownData(input, "item", "source.item"))
  const files = copyFiles(ownData(input, "files", "source.files"))
  const resolved = validateResolved(ownData(input, "resolved", "source.resolved"))
  const integrity = computeRegistryItemIntegrity({ item, files })
  const declaredIntegrity = item.meta.repopress.authoring.provenance?.integrity
  if (!declaredIntegrity || integrity !== declaredIntegrity) {
    throw new TypeError(`Registry integrity mismatch for ${item.meta.repopress.logicalId}`)
  }
  return {
    logicalId: item.meta.repopress.logicalId,
    reference,
    item,
    files,
    resolved,
    integrity,
    dependencies: [],
    authoring: normalizeRegistryAuthoringMetadata(item),
  }
}

export function resolveRegistryItems(input: ResolveRegistryItemsInput): readonly ResolvedRegistryItem[] {
  if (!Array.isArray(input.requested) || input.requested.length > MAX_REGISTRY_SOURCES) {
    throw new TypeError("Registry requested item limit exceeded")
  }
  if (!Array.isArray(input.sources) || input.sources.length > MAX_REGISTRY_SOURCES) {
    throw new TypeError("Registry source limit exceeded")
  }
  if (!(["next", "fumadocs", "astro"] as const).includes(input.framework)) throw new TypeError("Unsupported framework")

  const sources: ResolvedRegistryItem[] = []
  for (let index = 0; index < input.sources.length; index += 1) {
    sources.push(prepareSource(ownData(input.sources, String(index), `sources[${index}]`)))
  }
  const identities = new Map<string, ResolvedRegistryItem>()
  const aliases = new Map<string, ResolvedRegistryItem | null>()
  const registerAlias = (alias: string, source: ResolvedRegistryItem): void => {
    const current = aliases.get(alias)
    if (current === undefined) aliases.set(alias, source)
    else if (current !== source) aliases.set(alias, null)
  }
  for (const source of sources) {
    if (identities.has(source.logicalId)) throw new TypeError(`Duplicate registry logical identity ${source.logicalId}`)
    identities.set(source.logicalId, source)
    registerAlias(source.reference, source)
    registerAlias(source.logicalId, source)
  }

  const resolveReference = (reference: string): ResolvedRegistryItem => {
    const source = aliases.get(reference)
    if (source === null) throw new TypeError(`Ambiguous registry reference ${reference}`)
    if (!source) throw new TypeError(`Unknown registry reference ${reference}`)
    return source
  }
  const requested: string[] = []
  for (let index = 0; index < input.requested.length; index += 1) {
    requested.push(boundedString(ownData(input.requested, String(index), `requested[${index}]`), `requested[${index}]`))
  }
  requested.sort(compareCodeUnits)

  const visiting: ResolvedRegistryItem[] = []
  const visited = new Set<string>()
  const output: ResolvedRegistryItem[] = []
  const visit = (source: ResolvedRegistryItem): void => {
    const cycleIndex = visiting.findIndex((entry) => entry.logicalId === source.logicalId)
    if (cycleIndex >= 0) {
      const cycle = [...visiting.slice(cycleIndex).map((entry) => entry.logicalId), source.logicalId]
      throw new TypeError(`Registry dependency cycle: ${cycle.join(" -> ")}`)
    }
    if (visited.has(source.logicalId)) return
    if (visiting.length >= MAX_RESOLUTION_DEPTH) throw new TypeError("Registry dependency depth limit exceeded")
    if (!source.item.meta.repopress.frameworks.includes(input.framework)) {
      throw new TypeError(`Registry item ${source.logicalId} does not support ${input.framework}`)
    }
    visiting.push(source)
    const dependencies = [...(source.item.registryDependencies ?? [])].sort(compareCodeUnits).map(resolveReference)
    for (const dependency of dependencies) visit(dependency)
    visiting.pop()
    const resolvedSource = {
      ...source,
      dependencies: dependencies.map((dependency) => dependency.logicalId).sort(compareCodeUnits),
    }
    visited.add(source.logicalId)
    output.push(deepFreeze(resolvedSource))
  }
  for (const reference of requested) visit(resolveReference(reference))
  return deepFreeze(output)
}
