import { createHash } from "node:crypto"
import { posix } from "node:path"
import { type RepoPressLock, repoPressLockSchema } from "./lock-schema"
import { computeRegistryItemIntegrity, type RegistryIntegrityFile } from "./registry-integrity"
import type { ResolvedRegistryItem } from "./registry-resolver"
import { canonicalizeInstallTarget, compareCodeUnits, deepFreeze, installTargetSchema } from "./registry-schema"
import { adaptRuntimeMap, type RuntimeMapBinding } from "./runtime-map-adapter"

const MAX_SNAPSHOT_FILES = 8_192
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024
const SAFE_ALIAS = /^@[A-Za-z0-9._-]+$/u
const SAFE_IMPORT_PREFIX =
  /^(?:@\/[A-Za-z0-9._~/-]+|@?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._~/-]+)*|[.]{1,2}\/[A-Za-z0-9._~/-]+)$/u
const SAFE_CSS_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/u

export interface ProjectInstallAlias {
  name: string
  path: string
  importPrefix: string
}

export interface ProjectInstallLayout {
  framework: "next" | "fumadocs"
  aliases: readonly ProjectInstallAlias[]
  runtimeMapPath: string
  cssTarget: string
  lockPath: string
  packageJsonPath?: string
}

export interface RepositoryFileSnapshot {
  path: string
  content: string
}

export interface InstallConflict {
  code:
    | "TARGET_COLLISION"
    | "UNMANAGED_TARGET_EXISTS"
    | "LOCAL_MODIFICATION"
    | "UNKNOWN_TARGET_ALIAS"
    | "RUNTIME_MAP_CONFLICT"
    | "MISSING_RUNTIME_MAP"
    | "MISSING_PACKAGE_JSON"
    | "PACKAGE_VERSION_CONFLICT"
    | "UNSUPPORTED_ENV_VARS"
    | "UNSUPPORTED_CSS"
    | "LOCK_SNAPSHOT_MISMATCH"
    | "LOCK_DIGEST_MISMATCH"
    | "STALE_TARGET"
    | "MANAGED_CSS_MODIFIED"
  path: string
  message: string
}

export interface InstallWarning {
  code: "VERSION_CHANGE" | "INTEGRITY_CHANGE"
  itemId: string
  message: string
}

export interface InstallFileChange {
  kind: "registry" | "package" | "css" | "runtime-map" | "lock"
  owner: string
  path: string
  before: string | null
  after: string
  digest: string
}

export interface PackageChange {
  kind: "dependency" | "devDependency"
  name: string
  before: string | null
  after: string
}

export interface CssChange {
  itemId: string
  selector: string
  name: string
  before: string | null
  after: string
}

export interface RuntimeMapEdit {
  path: string
  before: string
  after: string
}

export interface RegistryInstallPlan {
  planVersion: 1
  applicable: boolean
  fileChanges: readonly InstallFileChange[]
  packageChanges: readonly PackageChange[]
  cssChanges: readonly CssChange[]
  runtimeMapEdit: RuntimeMapEdit
  lockSnapshot: RepoPressLock
  warnings: readonly InstallWarning[]
  conflicts: readonly InstallConflict[]
}

export interface PlanRegistryInstallInput {
  resolved: readonly ResolvedRegistryItem[]
  layout: ProjectInstallLayout
  currentFiles: readonly RepositoryFileSnapshot[]
  currentLock: unknown | null
}

type ValidatedLayout = Omit<ProjectInstallLayout, "aliases" | "packageJsonPath"> & {
  aliases: readonly ProjectInstallAlias[]
  packageJsonPath: string
}

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`
}

function ownString(object: object, key: string, label: string): string {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") {
    throw new TypeError(`${label} must be an own string data property`)
  }
  return descriptor.value
}

function validateLayout(layout: ProjectInstallLayout): ValidatedLayout {
  if (!layout || typeof layout !== "object" || Array.isArray(layout))
    throw new TypeError("Install layout must be an object")
  if (layout.framework !== "next" && layout.framework !== "fumadocs")
    throw new TypeError("Install layout framework is unsupported")
  if (!Array.isArray(layout.aliases) || layout.aliases.length === 0 || layout.aliases.length > 64) {
    throw new TypeError("Install aliases must be a non-empty bounded array")
  }
  const names = new Set<string>()
  const aliases = layout.aliases
    .map((alias, index) => {
      if (!alias || typeof alias !== "object" || Array.isArray(alias))
        throw new TypeError(`Alias ${index} must be an object`)
      const name = ownString(alias, "name", `aliases[${index}].name`)
      const path = installTargetSchema.parse(ownString(alias, "path", `aliases[${index}].path`))
      const importPrefix = ownString(alias, "importPrefix", `aliases[${index}].importPrefix`)
      if (!SAFE_ALIAS.test(name) || !SAFE_IMPORT_PREFIX.test(importPrefix))
        throw new TypeError(`Alias ${index} is invalid`)
      if (names.has(name)) throw new TypeError(`Duplicate install alias ${name}`)
      names.add(name)
      canonicalizeInstallTarget(path)
      return { name, path, importPrefix: importPrefix.replace(/\/$/u, "") }
    })
    .sort((left, right) => compareCodeUnits(left.name, right.name))
  const runtimeMapPath = installTargetSchema.parse(ownString(layout, "runtimeMapPath", "runtimeMapPath"))
  const cssTarget = installTargetSchema.parse(ownString(layout, "cssTarget", "cssTarget"))
  const lockPath = installTargetSchema.parse(ownString(layout, "lockPath", "lockPath"))
  const packageDescriptor = Object.getOwnPropertyDescriptor(layout, "packageJsonPath")
  const packageJsonPath = packageDescriptor
    ? typeof packageDescriptor.value === "string"
      ? installTargetSchema.parse(packageDescriptor.value)
      : (() => {
          throw new TypeError("packageJsonPath must be a string data property")
        })()
    : "package.json"
  for (const target of [runtimeMapPath, cssTarget, lockPath, packageJsonPath]) canonicalizeInstallTarget(target)
  return { framework: layout.framework, aliases, runtimeMapPath, cssTarget, lockPath, packageJsonPath }
}

function snapshotIndex(files: readonly RepositoryFileSnapshot[]): Map<string, RepositoryFileSnapshot> {
  if (!Array.isArray(files) || files.length > MAX_SNAPSHOT_FILES)
    throw new TypeError("Repository snapshot file limit exceeded")
  const result = new Map<string, RepositoryFileSnapshot>()
  let bytes = 0
  for (let index = 0; index < files.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(files, String(index))
    if (!descriptor || !("value" in descriptor))
      throw new TypeError(`Snapshot file ${index} must be an own data property`)
    const entry = descriptor.value
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new TypeError(`Snapshot file ${index} must be an object`)
    const path = ownString(entry, "path", `currentFiles[${index}].path`)
    const content = ownString(entry, "content", `currentFiles[${index}].content`)
    bytes += new TextEncoder().encode(content).byteLength
    if (bytes > MAX_SNAPSHOT_BYTES) throw new TypeError("Repository snapshot byte limit exceeded")
    const identity = canonicalizeInstallTarget(path)
    if (result.has(identity)) throw new TypeError(`Repository snapshot contains colliding path ${path}`)
    result.set(identity, { path, content })
  }
  return result
}

function resolveTarget(
  target: string,
  layout: ValidatedLayout,
): { path: string; importSource: string } | { conflict: InstallConflict } {
  const normalizedTarget = installTargetSchema.parse(target)
  const first = normalizedTarget.split("/", 1)[0]
  const alias = layout.aliases.find((candidate) => candidate.name === first)
  if (first.startsWith("@") && !alias) {
    return {
      conflict: {
        code: "UNKNOWN_TARGET_ALIAS",
        path: normalizedTarget,
        message: `Install target uses unknown caller-unresolved alias ${first}`,
      },
    }
  }
  const suffix = alias ? normalizedTarget.slice(alias.name.length).replace(/^\//u, "") : normalizedTarget
  const path = installTargetSchema.parse(alias ? `${alias.path.replace(/\/$/u, "")}/${suffix}` : suffix)
  const modulePath = suffix.replace(/\.(?:[cm]?[jt]sx?)$/u, "")
  const directModulePath = path.replace(/\.(?:[cm]?[jt]sx?)$/u, "")
  const relativeImport = posix.relative(posix.dirname(layout.runtimeMapPath), directModulePath)
  const importSource = alias
    ? `${alias.importPrefix}/${modulePath}`
    : relativeImport.startsWith(".")
      ? relativeImport
      : `./${relativeImport}`
  return { path, importSource }
}

function packageSpec(raw: string): { name: string; spec: string | null } {
  const hasControlCharacter = [...raw].some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
  })
  if (raw.length === 0 || raw.length > 512 || hasControlCharacter) {
    throw new TypeError(`Unsupported registry package dependency ${raw}`)
  }
  let name: string
  let spec: string | null
  if (raw.startsWith("@")) {
    const separator = raw.indexOf("@", raw.indexOf("/") + 1)
    name = separator >= 0 ? raw.slice(0, separator) : raw
    spec = separator >= 0 ? raw.slice(separator + 1) : null
    if (!/^@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(name)) {
      throw new TypeError(`Unsupported registry package dependency ${raw}`)
    }
  } else {
    const separator = raw.indexOf("@")
    name = separator >= 0 ? raw.slice(0, separator) : raw
    spec = separator >= 0 ? raw.slice(separator + 1) : null
    if (!/^[A-Za-z0-9._-]+$/u.test(name)) throw new TypeError(`Unsupported registry package dependency ${raw}`)
  }
  if (spec !== null && !/^[~^]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(spec)) {
    throw new TypeError(`Unsupported registry package dependency ${raw}`)
  }
  return { name, spec }
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
    ? (value as Record<string, unknown>)
    : null
}

function safeCssValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4_096 &&
    !/[{};]/u.test(value) &&
    !/(?:url\s*\(|@import|expression\s*\(|javascript:)/iu.test(value)
  )
}

function cssVariables(
  item: ResolvedRegistryItem,
  current: string,
): { changes: CssChange[]; block: string; conflict?: InstallConflict } {
  if (item.item.css !== undefined || item.item.tailwind !== undefined) {
    return {
      changes: [],
      block: "",
      conflict: {
        code: "UNSUPPORTED_CSS",
        path: "css",
        message: `Registry item ${item.logicalId} contains unsupported CSS or Tailwind metadata; only bounded cssVars are planned`,
      },
    }
  }
  const cssVars = item.item.cssVars
  if (cssVars === undefined) return { changes: [], block: "" }
  const themes = plainRecord(cssVars)
  if (!themes) {
    return {
      changes: [],
      block: "",
      conflict: {
        code: "UNSUPPORTED_CSS",
        path: "cssVars",
        message: `Registry item ${item.logicalId} cssVars must be an object`,
      },
    }
  }
  const changes: CssChange[] = []
  const rules: string[] = []
  for (const theme of Object.keys(themes).sort(compareCodeUnits)) {
    if (theme !== "light" && theme !== "dark") {
      return {
        changes: [],
        block: "",
        conflict: {
          code: "UNSUPPORTED_CSS",
          path: `cssVars.${theme}`,
          message: `Unsupported CSS variable theme ${theme}`,
        },
      }
    }
    const variables = plainRecord(themes[theme])
    if (!variables)
      return {
        changes: [],
        block: "",
        conflict: {
          code: "UNSUPPORTED_CSS",
          path: `cssVars.${theme}`,
          message: `CSS variable theme ${theme} must be an object`,
        },
      }
    const selector = theme === "light" ? ":root" : ".dark"
    const declarations: string[] = []
    for (const name of Object.keys(variables).sort(compareCodeUnits)) {
      const value = variables[name]
      if (!SAFE_CSS_NAME.test(name) || !safeCssValue(value)) {
        return {
          changes: [],
          block: "",
          conflict: {
            code: "UNSUPPORTED_CSS",
            path: `cssVars.${theme}.${name}`,
            message: `Unsafe CSS variable ${name}`,
          },
        }
      }
      const property = `--${name}`
      const match = current.match(
        new RegExp(`${property.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*:\\s*([^;]+)`, "u"),
      )
      changes.push({
        itemId: item.logicalId,
        selector,
        name: property,
        before: match?.[1]?.trim() ?? null,
        after: value,
      })
      declarations.push(`  ${property}: ${value};`)
    }
    if (declarations.length > 0) rules.push(`${selector} {\n${declarations.join("\n")}\n}`)
  }
  const block =
    rules.length > 0
      ? `/* repopress:${item.logicalId}:start */\n${rules.join("\n\n")}\n/* repopress:${item.logicalId}:end */`
      : ""
  return { changes, block }
}

type LocatedCssBlock = { start: number; end: number; block: string }

function locateManagedCssBlock(source: string, itemId: string): LocatedCssBlock | null | "invalid" {
  const startMarker = `/* repopress:${itemId}:start */`
  const endMarker = `/* repopress:${itemId}:end */`
  const indexes = (marker: string): number[] => {
    const found: number[] = []
    let offset = 0
    while (offset <= source.length) {
      const index = source.indexOf(marker, offset)
      if (index < 0) break
      found.push(index)
      offset = index + marker.length
    }
    return found
  }
  const starts = indexes(startMarker)
  const ends = indexes(endMarker)
  if (starts.length === 0 && ends.length === 0) return null
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) return "invalid"
  const end = ends[0] + endMarker.length
  return { start: starts[0], end, block: source.slice(starts[0], end) }
}

function removeLocatedCssBlock(source: string, located: LocatedCssBlock): string {
  let start = located.start
  let end = located.end
  if (source.slice(end, end + 2) === "\r\n") end += 2
  else if (source[end] === "\n") end += 1
  if (start > 0 && source[start - 1] === "\n") start -= 1
  return `${source.slice(0, start)}${source.slice(end)}`
}

function lockModificationDigest(
  targets: readonly { path: string; digest: string }[],
  managedCss: readonly { path: string; digest: string }[] = [],
): string {
  const targetFrames = [...targets]
    .sort((left, right) =>
      compareCodeUnits(canonicalizeInstallTarget(left.path), canonicalizeInstallTarget(right.path)),
    )
    .map((target) => `target\0${canonicalizeInstallTarget(target.path)}\0${target.digest}\n`)
  const cssFrames = [...managedCss]
    .sort((left, right) =>
      compareCodeUnits(canonicalizeInstallTarget(left.path), canonicalizeInstallTarget(right.path)),
    )
    .map((record) => `css\0${canonicalizeInstallTarget(record.path)}\0${record.digest}\n`)
  return sha256([...targetFrames, ...cssFrames].join(""))
}

function sortedDiagnostics<T extends { code: string; path?: string; itemId?: string; message: string }>(
  values: T[],
): T[] {
  return values.sort((left, right) => {
    return (
      compareCodeUnits(left.code, right.code) ||
      compareCodeUnits(left.path ?? left.itemId ?? "", right.path ?? right.itemId ?? "") ||
      compareCodeUnits(left.message, right.message)
    )
  })
}

function canonicalResolvedItems(
  items: readonly ResolvedRegistryItem[],
  framework: "next" | "fumadocs",
): ResolvedRegistryItem[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > 512) {
    throw new TypeError("Resolved registry items must be a non-empty bounded array")
  }
  const byId = new Map<string, ResolvedRegistryItem>()
  for (let index = 0; index < items.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(items, String(index))
    if (!descriptor || !("value" in descriptor))
      throw new TypeError(`Resolved item ${index} must be an own data property`)
    const item = descriptor.value
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new TypeError(`Resolved item ${index} must be an object`)
    if (byId.has(item.logicalId)) throw new TypeError(`Duplicate resolved logical identity ${item.logicalId}`)
    if (item.item.meta.repopress.logicalId !== item.logicalId || item.authoring.logicalId !== item.logicalId) {
      throw new TypeError(`Resolved logical identity mismatch for ${item.logicalId}`)
    }
    if (!item.item.meta.repopress.frameworks.includes(framework)) {
      throw new TypeError(`Resolved item ${item.logicalId} does not support ${framework}`)
    }
    const integrity = computeRegistryItemIntegrity({ item: item.item, files: item.files })
    if (integrity !== item.integrity || integrity !== item.authoring.provenance.integrity) {
      throw new TypeError(`Registry integrity mismatch for resolved item ${item.logicalId}`)
    }
    if (!Array.isArray(item.dependencies) || item.dependencies.length > 256) {
      throw new TypeError(`Resolved dependencies for ${item.logicalId} exceed the supported bound`)
    }
    byId.set(item.logicalId, item)
  }
  for (const item of byId.values()) {
    const seen = new Set<string>()
    for (const dependency of item.dependencies) {
      if (!byId.has(dependency)) throw new TypeError(`Missing resolved dependency ${dependency} for ${item.logicalId}`)
      if (seen.has(dependency)) throw new TypeError(`Duplicate resolved dependency ${dependency} for ${item.logicalId}`)
      seen.add(dependency)
    }
  }
  const visiting: string[] = []
  const visited = new Set<string>()
  const ordered: ResolvedRegistryItem[] = []
  const visit = (logicalId: string): void => {
    const cycleIndex = visiting.indexOf(logicalId)
    if (cycleIndex >= 0) {
      throw new TypeError(`Resolved dependency cycle: ${[...visiting.slice(cycleIndex), logicalId].join(" -> ")}`)
    }
    if (visited.has(logicalId)) return
    visiting.push(logicalId)
    const item = byId.get(logicalId) as ResolvedRegistryItem
    for (const dependency of [...item.dependencies].sort(compareCodeUnits)) visit(dependency)
    visiting.pop()
    visited.add(logicalId)
    ordered.push(item)
  }
  for (const logicalId of [...byId.keys()].sort(compareCodeUnits)) visit(logicalId)
  return ordered
}

export function planRegistryInstall(input: PlanRegistryInstallInput): RegistryInstallPlan {
  const layout = validateLayout(input.layout)
  const resolvedItems = canonicalResolvedItems(input.resolved, layout.framework)
  const snapshots = snapshotIndex(input.currentFiles)
  const conflicts: InstallConflict[] = []
  const lockFile = snapshots.get(canonicalizeInstallTarget(layout.lockPath))
  let currentLock: RepoPressLock | null = null
  if (lockFile) {
    try {
      currentLock = repoPressLockSchema.parse(JSON.parse(lockFile.content) as unknown)
    } catch (error) {
      throw new TypeError(`Invalid repository lock snapshot: ${error instanceof Error ? error.message : "parse error"}`)
    }
  }
  if (input.currentLock !== null) {
    const suppliedLock = repoPressLockSchema.parse(input.currentLock)
    if (!currentLock || JSON.stringify(suppliedLock) !== JSON.stringify(currentLock)) {
      conflicts.push({
        code: "LOCK_SNAPSHOT_MISMATCH",
        path: layout.lockPath,
        message: "Supplied current lock does not match the authoritative repository snapshot",
      })
    }
  }
  const warnings: InstallWarning[] = []
  const fileChanges: InstallFileChange[] = []
  const packageRequests = new Map<string, { kind: "dependency" | "devDependency"; spec: string | null }>()
  const targetOwners = new Map<string, string>()
  for (const path of [layout.runtimeMapPath, layout.packageJsonPath, layout.cssTarget, layout.lockPath]) {
    targetOwners.set(canonicalizeInstallTarget(path), "@repopress/system")
  }
  if (currentLock) {
    for (const [itemId, entry] of Object.entries(currentLock.items)) {
      for (const target of entry.targets) {
        const identity = canonicalizeInstallTarget(target.path)
        const owner = targetOwners.get(identity)
        if (owner && owner !== itemId) {
          conflicts.push({
            code: "TARGET_COLLISION",
            path: target.path,
            message: `Locked target ${target.path} collides between ${owner} and ${itemId}`,
          })
        } else targetOwners.set(identity, itemId)
      }
    }
  }
  const targetsByItem = new Map<string, Array<{ path: string; digest: string }>>()
  const runtimeBindings: RuntimeMapBinding[] = []

  for (const item of resolvedItems) {
    if (item.item.envVars && Object.keys(item.item.envVars).length > 0) {
      conflicts.push({
        code: "UNSUPPORTED_ENV_VARS",
        path: item.logicalId,
        message: `Registry item ${item.logicalId} requests environment variables`,
      })
    }
    const prior = currentLock?.items[item.logicalId]
    if (prior && lockModificationDigest(prior.targets, prior.managedCss) !== prior.localModificationDigest) {
      conflicts.push({
        code: "LOCK_DIGEST_MISMATCH",
        path: layout.lockPath,
        message: `Lock local-modification digest is inconsistent for ${item.logicalId}`,
      })
    }
    if (prior && prior.authoring.version !== item.authoring.version) {
      warnings.push({
        code: "VERSION_CHANGE",
        itemId: item.logicalId,
        message: `${prior.authoring.version ?? "unknown"} -> ${item.authoring.version ?? "unknown"}`,
      })
    }
    if (prior && prior.integrity !== item.integrity) {
      warnings.push({
        code: "INTEGRITY_CHANGE",
        itemId: item.logicalId,
        message: `${prior.integrity} -> ${item.integrity}`,
      })
    }
    if (prior) {
      for (const target of prior.targets) {
        const current = snapshots.get(canonicalizeInstallTarget(target.path))
        if (!current || sha256(current.content) !== target.digest) {
          conflicts.push({
            code: "LOCAL_MODIFICATION",
            path: target.path,
            message: `Installed target ${target.path} differs from its lock-recorded content digest`,
          })
        }
      }
    }

    const sourceByPath = new Map<string, string>(
      item.files.map((file: RegistryIntegrityFile): [string, string] => [file.path, file.content]),
    )
    for (const file of item.item.files ?? []) {
      const target = resolveTarget(file.target ?? file.path, layout)
      if ("conflict" in target) {
        conflicts.push({ ...target.conflict, path: file.target ?? file.path })
        continue
      }
      const content = sourceByPath.get(file.path)
      if (content === undefined) throw new TypeError(`Resolved bytes are missing for install file ${file.path}`)
      const identity = canonicalizeInstallTarget(target.path)
      const owner = targetOwners.get(identity)
      if (owner && owner !== item.logicalId) {
        conflicts.push({
          code: "TARGET_COLLISION",
          path: target.path,
          message: `Target ${target.path} collides between ${owner} and ${item.logicalId}`,
        })
        continue
      }
      targetOwners.set(identity, item.logicalId)
      const current = snapshots.get(identity)
      const lockedByItem =
        prior?.targets.some((lockedTarget) => canonicalizeInstallTarget(lockedTarget.path) === identity) ?? false
      if (current && !lockedByItem && current.content !== content) {
        conflicts.push({
          code: "UNMANAGED_TARGET_EXISTS",
          path: target.path,
          message: `Target ${target.path} already exists without RepoPress lock ownership`,
        })
      }
      const digest = sha256(content)
      const itemTargets = targetsByItem.get(item.logicalId) ?? []
      itemTargets.push({ path: target.path, digest })
      targetsByItem.set(item.logicalId, itemTargets)
      if (current?.content !== content) {
        fileChanges.push({
          kind: "registry",
          owner: item.logicalId,
          path: target.path,
          before: current?.content ?? null,
          after: content,
          digest,
        })
      }
      if (file.type === "registry:component") {
        runtimeBindings.push({
          mdxName: item.authoring.mdxName,
          exportName: item.authoring.exportName,
          importSource: target.importSource,
        })
      }
    }

    if (prior) {
      const nextTargets = new Set(
        (targetsByItem.get(item.logicalId) ?? []).map((target) => canonicalizeInstallTarget(target.path)),
      )
      for (const target of prior.targets) {
        if (!nextTargets.has(canonicalizeInstallTarget(target.path))) {
          conflicts.push({
            code: "STALE_TARGET",
            path: target.path,
            message: `Updated item ${item.logicalId} no longer owns prior target ${target.path}`,
          })
        }
      }
    }

    for (const [kind, dependencies] of [
      ["dependency", item.item.dependencies ?? []],
      ["devDependency", item.item.devDependencies ?? []],
    ] as const) {
      for (const raw of dependencies) {
        const parsed = packageSpec(raw)
        const existing = packageRequests.get(parsed.name)
        if (
          existing &&
          (existing.kind !== kind || (existing.spec !== null && parsed.spec !== null && existing.spec !== parsed.spec))
        ) {
          conflicts.push({
            code: "PACKAGE_VERSION_CONFLICT",
            path: parsed.name,
            message: `Registry items request incompatible versions of ${parsed.name}`,
          })
        } else packageRequests.set(parsed.name, { kind, spec: existing?.spec ?? parsed.spec })
      }
    }
  }

  const runtimeSnapshot = snapshots.get(canonicalizeInstallTarget(layout.runtimeMapPath))
  let runtimeMapEdit: RuntimeMapEdit = { path: layout.runtimeMapPath, before: "", after: "" }
  if (!runtimeSnapshot) {
    conflicts.push({
      code: "MISSING_RUNTIME_MAP",
      path: layout.runtimeMapPath,
      message: "The configured MDX runtime map file does not exist",
    })
  } else {
    const runtimeResult = adaptRuntimeMap({ source: runtimeSnapshot.content, bindings: runtimeBindings })
    runtimeMapEdit = { path: layout.runtimeMapPath, before: runtimeSnapshot.content, after: runtimeResult.source }
    if (!runtimeResult.ok) {
      conflicts.push({ code: "RUNTIME_MAP_CONFLICT", path: layout.runtimeMapPath, message: runtimeResult.message })
    } else if (runtimeResult.changed) {
      fileChanges.push({
        kind: "runtime-map",
        owner: "@repopress/system",
        path: layout.runtimeMapPath,
        before: runtimeSnapshot.content,
        after: runtimeResult.source,
        digest: sha256(runtimeResult.source),
      })
    }
  }

  const packageSnapshot = snapshots.get(canonicalizeInstallTarget(layout.packageJsonPath))
  const packageChanges: PackageChange[] = []
  if (packageRequests.size > 0) {
    if (!packageSnapshot) {
      conflicts.push({
        code: "MISSING_PACKAGE_JSON",
        path: layout.packageJsonPath,
        message: "The configured package.json does not exist",
      })
    } else {
      let manifest: Record<string, unknown>
      try {
        const parsed = JSON.parse(packageSnapshot.content) as unknown
        const record = plainRecord(parsed)
        if (!record) throw new TypeError("package.json root must be an object")
        manifest = record
      } catch (error) {
        throw new TypeError(`Invalid package.json: ${error instanceof Error ? error.message : "parse error"}`)
      }
      const dependenciesRecord = plainRecord(manifest.dependencies)
      const devDependenciesRecord = plainRecord(manifest.devDependencies)
      const dependencies = dependenciesRecord ?? {}
      const devDependencies = devDependenciesRecord ?? {}
      for (const name of [...packageRequests.keys()].sort(compareCodeUnits)) {
        const request = packageRequests.get(name) as {
          kind: "dependency" | "devDependency"
          spec: string | null
        }
        const target = request.kind === "dependency" ? dependencies : devDependencies
        const other = request.kind === "dependency" ? devDependencies : dependencies
        const sectionValue = request.kind === "dependency" ? manifest.dependencies : manifest.devDependencies
        if ((sectionValue !== undefined && !plainRecord(sectionValue)) || Object.hasOwn(other, name)) {
          conflicts.push({
            code: "PACKAGE_VERSION_CONFLICT",
            path: name,
            message: `Package ${name} has an unsupported or conflicting dependency section`,
          })
          continue
        }
        const beforeValue = target[name]
        if (beforeValue !== undefined && typeof beforeValue !== "string") {
          conflicts.push({
            code: "PACKAGE_VERSION_CONFLICT",
            path: name,
            message: `Installed package ${name} must use a string version`,
          })
          continue
        }
        const before = typeof beforeValue === "string" ? beforeValue : null
        if (before !== null) {
          if (request.spec !== null && before !== request.spec) {
            conflicts.push({
              code: "PACKAGE_VERSION_CONFLICT",
              path: name,
              message: `Installed package ${name}@${before} conflicts with requested ${request.spec}`,
            })
          }
          continue
        }
        const after = request.spec ?? "latest"
        target[name] = after
        packageChanges.push({ kind: request.kind, name, before, after })
      }
      if (packageChanges.length > 0) {
        if (Object.keys(dependencies).length > 0)
          manifest.dependencies = Object.fromEntries(
            Object.entries(dependencies).sort(([left], [right]) => compareCodeUnits(left, right)),
          )
        if (Object.keys(devDependencies).length > 0)
          manifest.devDependencies = Object.fromEntries(
            Object.entries(devDependencies).sort(([left], [right]) => compareCodeUnits(left, right)),
          )
        const after = `${JSON.stringify(manifest, null, 2)}\n`
        fileChanges.push({
          kind: "package",
          owner: "@repopress/system",
          path: layout.packageJsonPath,
          before: packageSnapshot.content,
          after,
          digest: sha256(after),
        })
      }
    }
  }

  const cssChanges: CssChange[] = []
  const cssSnapshot = snapshots.get(canonicalizeInstallTarget(layout.cssTarget))
  let cssAfter = cssSnapshot?.content ?? ""
  const managedCssByItem = new Map<string, Array<{ path: string; digest: string }>>()
  for (const item of resolvedItems) {
    const planned = cssVariables(item, cssAfter)
    if (planned.conflict) {
      conflicts.push({ ...planned.conflict, path: layout.cssTarget })
      continue
    }
    const priorManaged = currentLock?.items[item.logicalId]?.managedCss ?? []
    const priorRecord = priorManaged.find(
      (record) => canonicalizeInstallTarget(record.path) === canonicalizeInstallTarget(layout.cssTarget),
    )
    if (priorManaged.length > (priorRecord ? 1 : 0)) {
      conflicts.push({
        code: "MANAGED_CSS_MODIFIED",
        path: layout.cssTarget,
        message: `Managed CSS ownership for ${item.logicalId} points outside the configured CSS target`,
      })
      continue
    }
    const located = locateManagedCssBlock(cssAfter, item.logicalId)
    if (
      located === "invalid" ||
      (priorRecord && (!located || sha256(located.block) !== priorRecord.digest)) ||
      (!priorRecord && located)
    ) {
      conflicts.push({
        code: "MANAGED_CSS_MODIFIED",
        path: layout.cssTarget,
        message: `Managed CSS block for ${item.logicalId} is missing, duplicated, malformed, or locally modified`,
      })
      continue
    }
    cssChanges.push(...planned.changes)
    if (located) cssAfter = removeLocatedCssBlock(cssAfter, located)
    if (planned.block) {
      cssAfter = cssAfter.trimEnd()
      cssAfter = `${cssAfter}${cssAfter ? "\n\n" : ""}${planned.block}\n`
      managedCssByItem.set(item.logicalId, [{ path: layout.cssTarget, digest: sha256(planned.block) }])
    } else {
      managedCssByItem.set(item.logicalId, [])
    }
  }
  if (cssAfter !== (cssSnapshot?.content ?? "")) {
    fileChanges.push({
      kind: "css",
      owner: "@repopress/system",
      path: layout.cssTarget,
      before: cssSnapshot?.content ?? null,
      after: cssAfter,
      digest: sha256(cssAfter),
    })
  }

  const lockItems: Record<string, unknown> = Object.create(null)
  if (currentLock) {
    for (const itemId of Object.keys(currentLock.items).sort(compareCodeUnits))
      lockItems[itemId] = currentLock.items[itemId]
  }
  for (const item of resolvedItems) {
    const targets = targetsByItem.get(item.logicalId) ?? []
    if (targets.length === 0) continue
    lockItems[item.logicalId] = {
      resolved: item.resolved,
      integrity: item.integrity,
      dependencies: [...item.dependencies],
      targets,
      managedCss: managedCssByItem.get(item.logicalId) ?? [],
      authoring: item.authoring,
      localModificationDigest: lockModificationDigest(targets, managedCssByItem.get(item.logicalId) ?? []),
    }
  }
  const lockSnapshot = repoPressLockSchema.parse({ lockfileVersion: 1, items: lockItems })
  const lockBefore = snapshots.get(canonicalizeInstallTarget(layout.lockPath))?.content ?? null
  const lockAfter = `${JSON.stringify(lockSnapshot, null, 2)}\n`
  if (lockBefore !== lockAfter) {
    fileChanges.push({
      kind: "lock",
      owner: "@repopress/system",
      path: layout.lockPath,
      before: lockBefore,
      after: lockAfter,
      digest: sha256(lockAfter),
    })
  }

  const systemOrder = new Map(["package", "css", "runtime-map", "lock"].map((kind, index) => [kind, index]))
  const registryOrder = new Map(resolvedItems.map((item, index) => [item.logicalId, index]))
  fileChanges.sort((left, right) => {
    if (left.kind === "registry" && right.kind === "registry") {
      return (
        (registryOrder.get(left.owner) ?? 0) - (registryOrder.get(right.owner) ?? 0) ||
        compareCodeUnits(canonicalizeInstallTarget(left.path), canonicalizeInstallTarget(right.path))
      )
    }
    if (left.kind === "registry") return -1
    if (right.kind === "registry") return 1
    return (
      (systemOrder.get(left.kind) ?? 99) - (systemOrder.get(right.kind) ?? 99) ||
      compareCodeUnits(left.path, right.path)
    )
  })
  packageChanges.sort((left, right) => compareCodeUnits(left.name, right.name))
  cssChanges.sort(
    (left, right) =>
      compareCodeUnits(left.itemId, right.itemId) ||
      compareCodeUnits(left.selector, right.selector) ||
      compareCodeUnits(left.name, right.name),
  )
  sortedDiagnostics(conflicts)
  sortedDiagnostics(warnings)
  return deepFreeze({
    planVersion: 1 as const,
    applicable: conflicts.length === 0,
    fileChanges,
    packageChanges,
    cssChanges,
    runtimeMapEdit,
    lockSnapshot,
    warnings,
    conflicts,
  })
}

/** Dry-run deliberately returns the exact already-computed immutable plan. */
export function dryRunInstallPlan(plan: RegistryInstallPlan): RegistryInstallPlan {
  if (!Object.isFrozen(plan)) throw new TypeError("Dry-run requires an immutable install plan")
  return plan
}
