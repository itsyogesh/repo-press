import { createHash, type Hash } from "node:crypto"
import { compareCodeUnits, type RegistryItem, registryItemSchema, relativePathSchema } from "./registry-schema"

const INTEGRITY_DOMAIN = "repopress-registry-item-integrity-v1"
const MAX_REFERENCED_BYTES = 16 * 1024 * 1024

export interface RegistryIntegrityFile {
  path: string
  content: string
}

export interface ComputeRegistryItemIntegrityInput {
  item: unknown
  files: readonly RegistryIntegrityFile[]
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (!value || typeof value !== "object") throw new TypeError("Registry integrity manifest must be finite JSON")

  const entries = Object.keys(value as Record<string, unknown>)
    .sort(compareCodeUnits)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
  return `{${entries.join(",")}}`
}

function withoutDeclaredIntegrity(item: RegistryItem): RegistryItem {
  const repoPress = item.meta.repopress
  const provenance = repoPress.authoring.provenance
  if (!provenance?.integrity) return item

  const { integrity: _integrity, ...provenanceWithoutIntegrity } = provenance
  return {
    ...item,
    meta: {
      ...item.meta,
      repopress: {
        ...repoPress,
        authoring: {
          ...repoPress.authoring,
          provenance: provenanceWithoutIntegrity,
        },
      },
    },
  }
}

function referencedPaths(item: RegistryItem): string[] {
  const paths = new Set<string>()
  for (const file of item.files ?? []) paths.add(file.path)
  for (const fixture of item.meta.repopress.preview.fixtures) paths.add(fixture)
  for (const fixture of item.meta.repopress.authoring.previewFixtures ?? []) paths.add(fixture)
  if (item.meta.repopress.preview.defaultFixture) paths.add(item.meta.repopress.preview.defaultFixture)
  if (item.meta.repopress.authoring.defaultFixture) paths.add(item.meta.repopress.authoring.defaultFixture)
  for (const asset of item.meta.repopress.authoring.assets ?? []) paths.add(asset.path)
  return [...paths].sort(compareCodeUnits)
}

function addFrame(hash: Hash, bytes: Buffer): void {
  if (bytes.byteLength > 0xffffffff) throw new TypeError("Registry integrity frame exceeds uint32 length")
  const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(bytes.byteLength)
  hash.update(length)
  hash.update(bytes)
}

function indexFiles(files: readonly RegistryIntegrityFile[]): Map<string, Buffer> {
  if (!Array.isArray(files)) throw new TypeError("Registry integrity files must be an array")
  const indexed = new Map<string, Buffer>()
  let totalBytes = 0

  for (const file of files) {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      throw new TypeError("Registry integrity file must be an object")
    }
    const path = relativePathSchema.parse(file.path)
    if (typeof file.content !== "string") throw new TypeError(`Referenced bytes for ${path} must be a string`)
    if (indexed.has(path)) throw new TypeError(`Duplicate referenced bytes for ${path}`)
    const content = Buffer.from(file.content, "utf8")
    totalBytes += content.byteLength
    if (totalBytes > MAX_REFERENCED_BYTES) throw new TypeError("Registry integrity referenced bytes exceed limit")
    indexed.set(path, content)
  }

  return indexed
}

/**
 * Computes canonical SRI for a validated installable registry item. Object
 * keys are code-unit sorted, arrays retain semantic order, and only
 * meta.repopress.authoring.provenance.integrity is omitted to avoid recursion.
 * The canonical manifest and every referenced source/fixture byte sequence are
 * uint32 length-framed under a versioned domain before SHA-256 hashing.
 */
export function computeRegistryItemIntegrity({ item: inputItem, files }: ComputeRegistryItemIntegrityInput): string {
  const item = registryItemSchema.parse(inputItem)
  const paths = referencedPaths(item)
  const indexedFiles = indexFiles(files)

  for (const path of paths) {
    if (!indexedFiles.has(path)) throw new TypeError(`Missing referenced bytes for ${path}`)
  }
  for (const path of indexedFiles.keys()) {
    if (!paths.includes(path)) throw new TypeError(`Unexpected referenced bytes for ${path}`)
  }

  const hash = createHash("sha256")
  addFrame(hash, Buffer.from(INTEGRITY_DOMAIN, "utf8"))
  addFrame(hash, Buffer.from(canonicalJson(withoutDeclaredIntegrity(item)), "utf8"))
  for (const path of paths) {
    addFrame(hash, Buffer.from(path, "utf8"))
    addFrame(hash, indexedFiles.get(path) as Buffer)
  }
  return `sha256-${hash.digest("base64")}`
}
