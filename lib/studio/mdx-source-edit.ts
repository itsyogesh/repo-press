import { parseRepoPressMdxSyntax, type RepoPressMdxSyntaxNode } from "../preview/generic-render-model"
import { type AuthoringComponent, assertSafeAuthoringPropName, assertSafeMdxName } from "./authoring-catalog"
import { formatSafeLiteralPropValue } from "./component-serializer"

export const MDX_SOURCE_EDIT_LIMITS = Object.freeze({ maxChanges: 128 })

export type MdxComponentEditTarget = Readonly<{
  name: string
  /** Child indexes from the parser root. This disambiguates duplicate and nested components. */
  path: readonly number[]
  /** UTF-16 code-unit offsets, matching JavaScript slice and the owned MDX parser. */
  start: number
  end: number
  /** Exact bytes/code units used for optimistic concurrency and stale-target detection. */
  openingTag: string
  /** Shared immutable snapshot; exact equality detects edits anywhere in the document. */
  sourceSnapshot: string
}>

export type MdxSourceEditRefusal = Readonly<{
  ok: false
  source: string
  code: "UNSAFE_TO_PRESERVE"
}>

export type MdxSourceEditResult = Readonly<{ ok: true; source: string }> | MdxSourceEditRefusal
export type FindEditableMdxComponentsResult =
  | Readonly<{ ok: true; targets: readonly MdxComponentEditTarget[] }>
  | MdxSourceEditRefusal

export type PreparedComponentPropEdit = Readonly<{
  ok: true
  target: MdxComponentEditTarget
  initialProps: Readonly<Record<string, string | number | boolean | undefined>>
  editablePropNames: readonly string[]
}>

type OffsetPosition = { start?: { offset?: number }; end?: { offset?: number } }
type MdxAttribute = {
  position?: OffsetPosition
  type?: string
  name?: string
  value?: string | null | { type?: string; value?: string }
}
type MdxElement = RepoPressMdxSyntaxNode & { position?: OffsetPosition; attributes?: MdxAttribute[] }

const refuse = (source: string): MdxSourceEditRefusal => ({ ok: false, source, code: "UNSAFE_TO_PRESERVE" })

function dataValue(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !("value" in descriptor)) throw new TypeError(`${key} must be an own data property`)
  return descriptor.value
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function openingTagFor(source: string, node: MdxElement): { start: number; end: number; source: string } | null {
  const start = node.position?.start?.offset
  if (!Number.isSafeInteger(start) || (start as number) < 0 || typeof node.name !== "string") return null
  const safeStart = start as number
  if (source.slice(safeStart, safeStart + node.name.length + 1) !== `<${node.name}`) return null

  const attributes = node.attributes ?? []
  const last = attributes.at(-1)
  const afterName = safeStart + node.name.length + 1
  const scanStart = last?.position?.end?.offset ?? afterName
  if (!Number.isSafeInteger(scanStart) || (scanStart as number) < afterName || (scanStart as number) > source.length) {
    return null
  }
  let cursor = scanStart as number
  while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1
  if (source[cursor] === "/") {
    cursor += 1
    while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1
  }
  if (source[cursor] !== ">") return null
  const end = cursor + 1
  return { start: safeStart, end, source: source.slice(safeStart, end) }
}

function collectTargets(source: string, root: RepoPressMdxSyntaxNode): readonly MdxComponentEditTarget[] | null {
  const targets: MdxComponentEditTarget[] = []
  const stack: Array<{ node: RepoPressMdxSyntaxNode; path: number[] }> = [{ node: root, path: [] }]
  while (stack.length > 0) {
    const entry = stack.pop()
    if (!entry) break
    const node = entry.node as MdxElement
    if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
      // MDX fragments are represented as JSX nodes with a null name. They are
      // structural containers, not editable component targets, so keep walking
      // their children without weakening validation for named elements.
      if (node.name != null) {
        if (typeof node.name !== "string") return null
        try {
          assertSafeMdxName(node.name)
        } catch {
          return null
        }
        const opening = openingTagFor(source, node)
        if (!opening) return null
        targets.push(
          Object.freeze({
            name: node.name,
            path: Object.freeze([...entry.path]),
            start: opening.start,
            end: opening.end,
            openingTag: opening.source,
            sourceSnapshot: source,
          }),
        )
      }
    }
    for (let index = (node.children?.length ?? 0) - 1; index >= 0; index -= 1) {
      const child = node.children?.[index]
      if (child) stack.push({ node: child, path: [...entry.path, index] })
    }
  }
  return Object.freeze(targets)
}

/** Discover stable, position-bound edit identities through the owned bounded parser. */
export function findEditableMdxComponents(source: string): FindEditableMdxComponentsResult {
  if (typeof source !== "string") return refuse("")
  const parsed = parseRepoPressMdxSyntax(source)
  if (!parsed.ok) return refuse(source)
  const targets = collectTargets(source, parsed.root)
  return targets ? { ok: true, targets } : refuse(source)
}

function normalizeTarget(target: unknown): MdxComponentEditTarget | null {
  try {
    if (!isPlainDataRecord(target)) return null
    const name = dataValue(target, "name")
    const rawPath = dataValue(target, "path")
    const start = dataValue(target, "start")
    const end = dataValue(target, "end")
    const openingTag = dataValue(target, "openingTag")
    const sourceSnapshot = dataValue(target, "sourceSnapshot")
    if (!Array.isArray(rawPath) || Object.getPrototypeOf(rawPath) !== Array.prototype || rawPath.length > 128) {
      return null
    }
    const path: number[] = []
    for (let index = 0; index < rawPath.length; index += 1) {
      const part = dataValue(rawPath, String(index))
      if (!Number.isSafeInteger(part) || (part as number) < 0) return null
      path.push(part as number)
    }
    if (
      typeof name !== "string" ||
      !Number.isSafeInteger(start) ||
      (start as number) < 0 ||
      !Number.isSafeInteger(end) ||
      (end as number) <= (start as number) ||
      typeof openingTag !== "string" ||
      typeof sourceSnapshot !== "string"
    ) {
      return null
    }
    return { name, path, start: start as number, end: end as number, openingTag, sourceSnapshot }
  } catch {
    return null
  }
}

function sameTarget(candidate: MdxComponentEditTarget, target: MdxComponentEditTarget): boolean {
  return (
    candidate.name === target.name &&
    candidate.start === target.start &&
    candidate.end === target.end &&
    candidate.openingTag === target.openingTag &&
    candidate.sourceSnapshot === target.sourceSnapshot &&
    candidate.path.length === target.path.length &&
    candidate.path.every((part, index) => part === target.path[index])
  )
}

function findNodeAtPath(root: RepoPressMdxSyntaxNode, path: readonly number[]): MdxElement | null {
  let node = root
  for (const index of path) {
    const child = node.children?.[index]
    if (!child) return null
    node = child
  }
  return node as MdxElement
}

function normalizeEditAnchor(anchor: unknown): { name: string; start: number; sourceSnapshot: string } | null {
  try {
    if (!isPlainDataRecord(anchor)) return null
    const name = dataValue(anchor, "name")
    const start = dataValue(anchor, "start")
    const sourceSnapshot = dataValue(anchor, "sourceSnapshot")
    if (
      typeof name !== "string" ||
      !Number.isSafeInteger(start) ||
      (start as number) < 0 ||
      typeof sourceSnapshot !== "string"
    ) {
      return null
    }
    assertSafeMdxName(name)
    return { name, start: start as number, sourceSnapshot }
  } catch {
    return null
  }
}

/**
 * MDXEditor trims its initial Markdown before producing MDAST positions while
 * its imperative getMarkdown() initially exposes the untrimmed value. Later
 * positions are relative to getMarkdown() directly. Accept either coordinate
 * system only when it identifies one unique same-name opening boundary.
 */
function resolveEditAnchorStart(source: string, anchor: Readonly<{ name: string; start: number }>): number | null {
  const openingPrefix = `<${anchor.name}`
  const candidates = new Set<number>()
  const addCandidate = (start: number) => {
    if (source.slice(start, start + openingPrefix.length) === openingPrefix) candidates.add(start)
  }

  addCandidate(anchor.start)
  const leadingWhitespaceLength = source.length - source.trimStart().length
  addCandidate(anchor.start + leadingWhitespaceLength)

  return candidates.size === 1 ? (candidates.values().next().value ?? null) : null
}

/** Prepare an exact clicked component for literal-only, source-preserving prop editing. */
export function prepareComponentPropEdit(
  source: string,
  anchor: unknown,
  component: AuthoringComponent,
): PreparedComponentPropEdit | MdxSourceEditRefusal {
  if (typeof source !== "string") return refuse("")
  const normalizedAnchor = normalizeEditAnchor(anchor)
  if (!normalizedAnchor || component.mdxName !== normalizedAnchor.name || component.schemaStatus !== "complete") {
    return refuse(source)
  }
  if (normalizedAnchor.sourceSnapshot !== source) return refuse(source)
  const resolvedStart = resolveEditAnchorStart(source, normalizedAnchor)
  if (resolvedStart === null) return refuse(source)
  const parsed = parseRepoPressMdxSyntax(source)
  if (!parsed.ok) return refuse(source)
  const discovered = collectTargets(source, parsed.root)
  if (!discovered) return refuse(source)
  const matches = discovered.filter((target) => target.name === normalizedAnchor.name && target.start === resolvedStart)
  if (matches.length !== 1) return refuse(source)
  const target = matches[0]
  const node = findNodeAtPath(parsed.root, target.path)
  if (!node || node.name !== component.mdxName) return refuse(source)

  const attributes = new Map<string, MdxAttribute>()
  for (const attribute of node.attributes ?? []) {
    if (
      attribute.type !== "mdxJsxAttribute" ||
      typeof attribute.name !== "string" ||
      attributes.has(attribute.name) ||
      (typeof attribute.value === "object" && attribute.value !== null)
    ) {
      return refuse(source)
    }
    try {
      assertSafeAuthoringPropName(attribute.name)
    } catch {
      return refuse(source)
    }
    attributes.set(attribute.name, attribute)
  }

  const initialProps: Record<string, string | number | boolean | undefined> = {}
  const editablePropNames: string[] = []
  for (const prop of component.props) {
    if (prop.type === "expression") continue
    editablePropNames.push(prop.name)
    const attribute = attributes.get(prop.name)
    if (!attribute) {
      const defaultValue = prop.default
      if (["string", "number", "boolean"].includes(typeof defaultValue)) {
        initialProps[prop.name] = defaultValue as string | number | boolean
      } else initialProps[prop.name] = undefined
      continue
    }
    if (prop.type === "boolean") {
      if (attribute.value !== null && attribute.value !== undefined) return refuse(source)
      initialProps[prop.name] = true
      continue
    }
    if (prop.type === "number" || typeof attribute.value !== "string") return refuse(source)
    initialProps[prop.name] = attribute.value
  }

  return Object.freeze({
    ok: true as const,
    target,
    initialProps: Object.freeze(initialProps),
    editablePropNames: Object.freeze(editablePropNames),
  })
}

function literalAttributeValue(attribute: MdxAttribute): string | boolean | undefined {
  if (attribute.value === null || attribute.value === undefined) return true
  return typeof attribute.value === "string" ? attribute.value : undefined
}

function quoteAndValueRange(
  source: string,
  attribute: MdxAttribute,
): { start: number; end: number; quote: '"' | "'" } | null {
  const start = attribute.position?.start?.offset
  const end = attribute.position?.end?.offset
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || (start as number) >= (end as number)) return null
  const raw = source.slice(start as number, end as number)
  const equals = raw.indexOf("=")
  if (equals === -1) return null
  let quoteIndex = equals + 1
  while (/\s/.test(raw[quoteIndex] ?? "")) quoteIndex += 1
  const quote = raw[quoteIndex]
  if (quote !== '"' && quote !== "'") return null
  if (raw.at(-1) !== quote) return null
  return { start: (start as number) + quoteIndex + 1, end: (end as number) - 1, quote }
}

function escapeQuotedLiteral(value: string, quote: '"' | "'"): string {
  let escaped = value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  escaped = quote === '"' ? escaped.replaceAll('"', "&quot;") : escaped.replaceAll("'", "&apos;")
  return escaped.replaceAll("{", "&#123;").replaceAll("}", "&#125;")
}

type Replacement = { start: number; end: number; value: string }

function normalizeChanges(
  changes: unknown,
): Array<{ name: string; value: string | number | boolean | null | undefined }> {
  if (!isPlainDataRecord(changes)) throw new TypeError("Changes must be a plain data object")
  const keys = Object.keys(changes)
  if (keys.length > MDX_SOURCE_EDIT_LIMITS.maxChanges) throw new TypeError("Too many component prop changes")
  return keys.map((name) => {
    assertSafeAuthoringPropName(name)
    const value = dataValue(changes, name)
    if (value !== null && value !== undefined && !["string", "number", "boolean"].includes(typeof value)) {
      throw new TypeError("Component prop edits accept literal values only")
    }
    if (typeof value === "number" && !Number.isFinite(value))
      throw new TypeError("Component prop number must be finite")
    return { name, value: value as string | number | boolean | null | undefined }
  })
}

/**
 * Apply literal prop changes to one verified opening tag. No full-document AST
 * serialization occurs; refusal always returns the exact caller-owned source.
 */
export function editComponentProp(source: string, target: unknown, changes: unknown): MdxSourceEditResult {
  if (typeof source !== "string") return refuse("")
  const normalizedTarget = normalizeTarget(target)
  if (!normalizedTarget) return refuse(source)
  if (normalizedTarget.sourceSnapshot !== source) return refuse(source)
  let normalizedChanges: ReturnType<typeof normalizeChanges>
  try {
    assertSafeMdxName(normalizedTarget.name)
    normalizedChanges = normalizeChanges(changes)
  } catch {
    return refuse(source)
  }

  const parsed = parseRepoPressMdxSyntax(source)
  if (!parsed.ok) return refuse(source)
  const discovered = collectTargets(source, parsed.root)
  const candidate = discovered?.find((item) => sameTarget(item, normalizedTarget))
  if (!candidate || source.slice(normalizedTarget.start, normalizedTarget.end) !== normalizedTarget.openingTag) {
    return refuse(source)
  }
  const node = findNodeAtPath(parsed.root, normalizedTarget.path)
  if (!node || node.name !== normalizedTarget.name) return refuse(source)

  const attributes = node.attributes ?? []
  const byName = new Map<string, MdxAttribute>()
  for (const attribute of attributes) {
    if (attribute.type !== "mdxJsxAttribute" || typeof attribute.name !== "string" || byName.has(attribute.name)) {
      return refuse(source)
    }
    try {
      assertSafeAuthoringPropName(attribute.name)
    } catch {
      return refuse(source)
    }
    byName.set(attribute.name, attribute)
  }

  const replacements: Replacement[] = []
  let additions = ""
  for (const change of normalizedChanges) {
    const attribute = byName.get(change.name)
    if (!attribute) {
      if (change.value === null || change.value === undefined) continue
      let formatted: string
      try {
        formatted = formatSafeLiteralPropValue(change.value)
      } catch {
        return refuse(source)
      }
      additions += ` ${change.name}=${formatted}`
      continue
    }

    const start = attribute.position?.start?.offset
    const end = attribute.position?.end?.offset
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return refuse(source)
    if (typeof attribute.value === "object" && attribute.value !== null) return refuse(source)
    const current = literalAttributeValue(attribute)
    if (change.value !== null && change.value !== undefined && Object.is(current, change.value)) continue

    if (change.value === null || change.value === undefined) {
      let removeStart = start as number
      const nameBoundary = normalizedTarget.start + normalizedTarget.name.length + 1
      while (removeStart > nameBoundary && /\s/.test(source[removeStart - 1] ?? "")) removeStart -= 1
      replacements.push({ start: removeStart, end: end as number, value: "" })
      continue
    }
    if (typeof change.value === "string" && typeof attribute.value === "string") {
      const range = quoteAndValueRange(source, attribute)
      if (!range) return refuse(source)
      replacements.push({ start: range.start, end: range.end, value: escapeQuotedLiteral(change.value, range.quote) })
      continue
    }
    let formatted: string
    try {
      formatted = formatSafeLiteralPropValue(change.value)
    } catch {
      return refuse(source)
    }
    replacements.push({ start: start as number, end: end as number, value: `${change.name}=${formatted}` })
  }

  if (additions) {
    const lastAttributeEnd =
      attributes.at(-1)?.position?.end?.offset ?? normalizedTarget.start + normalizedTarget.name.length + 1
    if (!Number.isSafeInteger(lastAttributeEnd)) return refuse(source)
    replacements.push({ start: lastAttributeEnd as number, end: lastAttributeEnd as number, value: additions })
  }
  if (replacements.length === 0) return { ok: true, source }
  replacements.sort((left, right) => right.start - left.start)
  for (let index = 1; index < replacements.length; index += 1) {
    const previous = replacements[index - 1]
    const current = replacements[index]
    if (previous && current && current.end > previous.start) return refuse(source)
  }
  let edited = source
  for (const replacement of replacements) {
    if (replacement.start < normalizedTarget.start || replacement.end > normalizedTarget.end) return refuse(source)
    edited = edited.slice(0, replacement.start) + replacement.value + edited.slice(replacement.end)
  }
  return { ok: true, source: edited }
}
