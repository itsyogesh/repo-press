import { createHash } from "node:crypto"
import { posix } from "node:path"
import ts from "typescript"
import { type RepoPressLock, repoPressLockSchema } from "./lock-schema"
import type { RegistryIntegrityFile } from "./registry-integrity"
import { type ResolvedRegistryItem, resolveRegistryItems } from "./registry-resolver"
import { canonicalizeInstallTarget, compareCodeUnits, deepFreeze, installTargetSchema } from "./registry-schema"
import { adaptRuntimeMap, type RuntimeMapBinding } from "./runtime-map-adapter"

const MAX_SNAPSHOT_FILES = 8_192
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024
const MAX_PACKAGE_JSON_BYTES = 1024 * 1024
const MAX_CSS_BYTES = 1024 * 1024
const MAX_LOCK_BYTES = 2 * 1024 * 1024
const MAX_RUNTIME_MAP_BYTES = 2 * 1024 * 1024
const MAX_PACKAGE_JSON_DEPTH = 64
const MAX_PACKAGE_JSON_NODES = 20_000
const MAX_PACKAGE_JSON_PROPERTIES = 10_000
const MAX_PACKAGE_JSON_STRING_BYTES = 512 * 1024
const MAX_PLANNED_CSS_DECLARATIONS = 2_048
const MAX_PLANNED_CSS_BYTES = 512 * 1024
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

function assertSystemSnapshotLimit(
  snapshots: ReadonlyMap<string, RepositoryFileSnapshot>,
  path: string,
  label: string,
  maximum: number,
): void {
  const snapshot = snapshots.get(canonicalizeInstallTarget(path))
  if (snapshot && new TextEncoder().encode(snapshot.content).byteLength > maximum) {
    throw new TypeError(`${label} exceeds byte limit`)
  }
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

type PackageSectionName = "dependencies" | "devDependencies"
type TextEdit = { start: number; end: number; text: string }
type ParsedPackageDocument = {
  source: string
  body: string
  bomOffset: number
  sourceFile: ts.JsonSourceFile
  root: ts.ObjectLiteralExpression
  rootProperties: ReadonlyMap<string, ts.PropertyAssignment>
  manifest: Record<string, unknown>
  newline: "\n" | "\r\n"
  rootIndent: string
}

function lineIndent(source: string, position: number): string {
  const lineStart = source.lastIndexOf("\n", Math.max(0, position - 1)) + 1
  return source.slice(lineStart, position).match(/^[\t ]*/u)?.[0] ?? ""
}

function parsePackageDocument(source: string): ParsedPackageDocument {
  const bomOffset = source.startsWith("\uFEFF") ? 1 : 0
  const body = source.slice(bomOffset)
  const sourceFile = ts.parseJsonText("package.json", body)
  const diagnostics = (sourceFile as ts.JsonSourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
    .parseDiagnostics
  if (diagnostics.length > 0) {
    throw new TypeError(
      `package.json syntax error: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, " ")}`,
    )
  }
  const statement = sourceFile.statements[0]
  if (
    sourceFile.statements.length !== 1 ||
    !statement ||
    !ts.isExpressionStatement(statement) ||
    !ts.isObjectLiteralExpression(statement.expression)
  ) {
    throw new TypeError("package.json root must be an object")
  }
  const root = statement.expression
  const stack: Array<{ node: ts.Expression; depth: number }> = [{ node: root, depth: 0 }]
  let nodes = 0
  let properties = 0
  let stringBytes = 0
  const rootProperties = new Map<string, ts.PropertyAssignment>()
  while (stack.length > 0) {
    const current = stack.pop() as { node: ts.Expression; depth: number }
    if (current.depth > MAX_PACKAGE_JSON_DEPTH) throw new TypeError("package.json exceeds depth limit")
    nodes += 1
    if (nodes > MAX_PACKAGE_JSON_NODES) throw new TypeError("package.json exceeds node limit")
    if (ts.isStringLiteralLike(current.node)) {
      stringBytes += new TextEncoder().encode(current.node.text).byteLength
      if (stringBytes > MAX_PACKAGE_JSON_STRING_BYTES) throw new TypeError("package.json exceeds string byte limit")
    }
    if (ts.isObjectLiteralExpression(current.node)) {
      const seen = new Set<string>()
      for (const property of current.node.properties) {
        properties += 1
        if (properties > MAX_PACKAGE_JSON_PROPERTIES) throw new TypeError("package.json exceeds property limit")
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteralLike(property.name)) {
          throw new TypeError("package.json contains an unsupported property")
        }
        const name = property.name.text
        stringBytes += new TextEncoder().encode(name).byteLength
        if (stringBytes > MAX_PACKAGE_JSON_STRING_BYTES) throw new TypeError("package.json exceeds string byte limit")
        if (seen.has(name)) throw new TypeError(`package.json contains duplicate key ${name}`)
        seen.add(name)
        if (current.node === root) rootProperties.set(name, property)
        stack.push({ node: property.initializer, depth: current.depth + 1 })
      }
      continue
    }
    if (ts.isArrayLiteralExpression(current.node)) {
      for (const element of current.node.elements) {
        if (ts.isSpreadElement(element)) throw new TypeError("package.json contains an unsupported array element")
        stack.push({ node: element, depth: current.depth + 1 })
      }
      continue
    }
    if (ts.isPrefixUnaryExpression(current.node)) {
      if (!ts.isNumericLiteral(current.node.operand)) throw new TypeError("package.json contains an unsupported value")
      stack.push({ node: current.node.operand, depth: current.depth + 1 })
      continue
    }
    if (
      !ts.isStringLiteralLike(current.node) &&
      !ts.isNumericLiteral(current.node) &&
      ![ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(current.node.kind)
    ) {
      throw new TypeError("package.json contains an unsupported value")
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch (error) {
    throw new TypeError(`package.json is not strict JSON: ${error instanceof Error ? error.message : "parse error"}`)
  }
  const manifest = plainRecord(parsed)
  if (!manifest) throw new TypeError("package.json root must be an object")
  const newline = body.includes("\r\n") ? "\r\n" : "\n"
  const firstRootProperty = root.properties[0]
  const rootIndent = firstRootProperty ? lineIndent(body, firstRootProperty.getStart(sourceFile)) : "  "
  return { source, body, bomOffset, sourceFile, root, rootProperties, manifest, newline, rootIndent }
}

function appendObjectMembers(
  document: ParsedPackageDocument,
  object: ts.ObjectLiteralExpression,
  rawMembers: readonly string[],
  fallbackIndent: string,
): TextEdit {
  const { body, bomOffset, newline, sourceFile } = document
  const close = object.end - 1
  const first = object.properties[0]
  const memberIndent = first ? lineIndent(body, first.getStart(sourceFile)) : fallbackIndent
  const last = object.properties.at(-1)
  if (!last) {
    return {
      start: object.getStart(sourceFile) + 1 + bomOffset,
      end: close + bomOffset,
      text: `${newline}${memberIndent}${rawMembers.join(`,${newline}${memberIndent}`)}${newline}${lineIndent(body, close)}`,
    }
  }
  const multiline = body.slice(object.getStart(sourceFile), close).includes("\n")
  return multiline
    ? {
        start: last.end + bomOffset,
        end: last.end + bomOffset,
        text: `,${newline}${memberIndent}${rawMembers.join(`,${newline}${memberIndent}`)}`,
      }
    : {
        start: last.end + bomOffset,
        end: last.end + bomOffset,
        text: `, ${rawMembers.join(", ")}`,
      }
}

function patchPackageDocument(
  document: ParsedPackageDocument,
  additions: ReadonlyMap<PackageSectionName, ReadonlyMap<string, string>>,
): string {
  const edits: TextEdit[] = []
  const missingSections: string[] = []
  const indentationUnit = document.rootIndent || "  "
  for (const section of ["dependencies", "devDependencies"] as const) {
    const entries = additions.get(section)
    if (!entries || entries.size === 0) continue
    const rawMembers = [...entries.entries()]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([name, value]) => `${JSON.stringify(name)}: ${JSON.stringify(value)}`)
    const property = document.rootProperties.get(section)
    if (property) {
      if (!ts.isObjectLiteralExpression(property.initializer)) {
        throw new TypeError(`package.json ${section} section is not surgically editable`)
      }
      const fallback = `${lineIndent(document.body, property.getStart(document.sourceFile))}${indentationUnit}`
      edits.push(appendObjectMembers(document, property.initializer, rawMembers, fallback))
    } else {
      const innerIndent = `${document.rootIndent}${indentationUnit}`
      missingSections.push(
        `${JSON.stringify(section)}: {${document.newline}${innerIndent}${rawMembers.join(
          `,${document.newline}${innerIndent}`,
        )}${document.newline}${document.rootIndent}}`,
      )
    }
  }
  if (missingSections.length > 0) {
    edits.push(appendObjectMembers(document, document.root, missingSections, document.rootIndent))
  }
  let result = document.source
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`
  }
  return result
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
  currentVariables: ReadonlyMap<string, string>,
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
      changes.push({
        itemId: item.logicalId,
        selector,
        name: property,
        before: currentVariables.get(property) ?? null,
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

function indexCssVariables(source: string): Map<string, string> {
  const variables = new Map<string, string>()
  const declaration = /(--[A-Za-z_][A-Za-z0-9_-]{0,127})\s*:\s*([^;{}]+);/gu
  for (const match of source.matchAll(declaration)) {
    if (!variables.has(match[1])) variables.set(match[1], match[2].trim())
  }
  return variables
}

function indexManagedCssBlocks(source: string): Map<string, LocatedCssBlock | "invalid"> {
  const markers = new Map<
    string,
    { starts: Array<{ start: number; end: number }>; ends: Array<{ start: number; end: number }> }
  >()
  const marker = /\/\* repopress:(.+?):(start|end) \*\//gu
  for (const match of source.matchAll(marker)) {
    const itemId = match[1]
    const record = markers.get(itemId) ?? { starts: [], ends: [] }
    record[match[2] === "start" ? "starts" : "ends"].push({
      start: match.index,
      end: match.index + match[0].length,
    })
    markers.set(itemId, record)
  }
  const blocks = new Map<string, LocatedCssBlock | "invalid">()
  for (const [itemId, record] of markers) {
    if (record.starts.length !== 1 || record.ends.length !== 1 || record.ends[0].start < record.starts[0].start) {
      blocks.set(itemId, "invalid")
      continue
    }
    blocks.set(itemId, {
      start: record.starts[0].start,
      end: record.ends[0].end,
      block: source.slice(record.starts[0].start, record.ends[0].end),
    })
  }
  return blocks
}

function plannedCssBudget(items: readonly ResolvedRegistryItem[]): InstallConflict | null {
  let declarations = 0
  let bytes = 0
  for (const item of items) {
    const themes = plainRecord(item.item.cssVars)
    if (!themes) continue
    for (const value of Object.values(themes)) {
      const variables = plainRecord(value)
      if (!variables) continue
      for (const [name, declarationValue] of Object.entries(variables)) {
        declarations += 1
        bytes += new TextEncoder().encode(`${name}:${String(declarationValue)}\n`).byteLength
        if (declarations > MAX_PLANNED_CSS_DECLARATIONS || bytes > MAX_PLANNED_CSS_BYTES) {
          return {
            code: "UNSUPPORTED_CSS",
            path: "cssVars",
            message: "Aggregate planned CSS declarations exceed the supported bound",
          }
        }
      }
    }
  }
  return null
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
    .map((target) => `${canonicalizeInstallTarget(target.path)}\0${target.digest}\n`)
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
  const sources: Array<{
    reference: string
    item: unknown
    files: readonly RegistryIntegrityFile[]
    resolved: { address: string; sourceRef: string; resolvedRef: string }
  }> = []
  for (let index = 0; index < items.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(items, String(index))
    if (!descriptor || !("value" in descriptor))
      throw new TypeError(`Resolved item ${index} must be an own data property`)
    const item = descriptor.value
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new TypeError(`Resolved item ${index} must be an object`)
    const read = (key: string): unknown => {
      const field = Object.getOwnPropertyDescriptor(item, key)
      if (!field || !("value" in field))
        throw new TypeError(`Resolved item ${index}.${key} must be an own data property`)
      return field.value
    }
    sources.push({
      reference: read("reference") as string,
      item: read("item"),
      files: read("files") as readonly RegistryIntegrityFile[],
      resolved: read("resolved") as { address: string; sourceRef: string; resolvedRef: string },
    })
  }
  return [
    ...resolveRegistryItems({
      requested: sources.map((source) => source.reference),
      sources,
      framework,
    }),
  ]
}

export function planRegistryInstall(input: PlanRegistryInstallInput): RegistryInstallPlan {
  const layout = validateLayout(input.layout)
  const resolvedItems = canonicalResolvedItems(input.resolved, layout.framework)
  const snapshots = snapshotIndex(input.currentFiles)
  assertSystemSnapshotLimit(snapshots, layout.packageJsonPath, "package.json", MAX_PACKAGE_JSON_BYTES)
  assertSystemSnapshotLimit(snapshots, layout.cssTarget, "CSS snapshot", MAX_CSS_BYTES)
  assertSystemSnapshotLimit(snapshots, layout.lockPath, "lock snapshot", MAX_LOCK_BYTES)
  assertSystemSnapshotLimit(snapshots, layout.runtimeMapPath, "runtime map", MAX_RUNTIME_MAP_BYTES)
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
      let document: ParsedPackageDocument
      try {
        document = parsePackageDocument(packageSnapshot.content)
      } catch (error) {
        throw new TypeError(`Invalid package.json: ${error instanceof Error ? error.message : "parse error"}`)
      }
      const manifest = document.manifest
      const dependenciesRecord = plainRecord(manifest.dependencies)
      const devDependenciesRecord = plainRecord(manifest.devDependencies)
      const dependencies = dependenciesRecord ?? {}
      const devDependencies = devDependenciesRecord ?? {}
      const additions = new Map<PackageSectionName, Map<string, string>>()
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
        const section = request.kind === "dependency" ? "dependencies" : "devDependencies"
        const sectionAdditions = additions.get(section) ?? new Map<string, string>()
        sectionAdditions.set(name, after)
        additions.set(section, sectionAdditions)
        packageChanges.push({ kind: request.kind, name, before, after })
      }
      if (packageChanges.length > 0) {
        const after = patchPackageDocument(document, additions)
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
  const cssSource = cssSnapshot?.content ?? ""
  let cssAfter = cssSource
  const cssVariableIndex = indexCssVariables(cssSource)
  const managedBlockIndex = indexManagedCssBlocks(cssSource)
  const managedCssByItem = new Map<string, Array<{ path: string; digest: string }>>()
  const cssBudgetConflict = plannedCssBudget(resolvedItems)
  const acceptedRemovals: LocatedCssBlock[] = []
  const plannedBlocks: string[] = []
  if (cssBudgetConflict) {
    conflicts.push({ ...cssBudgetConflict, path: layout.cssTarget })
    for (const item of resolvedItems) {
      managedCssByItem.set(item.logicalId, [...(currentLock?.items[item.logicalId]?.managedCss ?? [])])
    }
  } else {
    for (const item of resolvedItems) {
      const planned = cssVariables(item, cssVariableIndex)
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
      const located = managedBlockIndex.get(item.logicalId) ?? null
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
      if (located) {
        acceptedRemovals.push(located)
        for (const name of indexCssVariables(located.block).keys()) cssVariableIndex.delete(name)
      }
      for (const change of planned.changes) cssVariableIndex.set(change.name, change.after)
      if (planned.block) {
        plannedBlocks.push(planned.block)
        managedCssByItem.set(item.logicalId, [{ path: layout.cssTarget, digest: sha256(planned.block) }])
      } else {
        managedCssByItem.set(item.logicalId, [])
      }
    }
    for (const located of acceptedRemovals.sort((left, right) => right.start - left.start)) {
      cssAfter = removeLocatedCssBlock(cssAfter, located)
    }
    for (const block of plannedBlocks) {
      cssAfter = cssAfter.trimEnd()
      cssAfter = `${cssAfter}${cssAfter ? "\n\n" : ""}${block}\n`
    }
  }
  if (cssAfter !== cssSource) {
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
