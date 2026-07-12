import { compareCodeUnits } from "@/lib/repopress/registry-schema"
import {
  inspectGenericSourcePreflight,
  parseRepoPressMdxSyntax,
  type RepoPressMdxParseFailure,
  type RepoPressMdxSyntaxNode,
} from "../preview/generic-render-model"
import type { AuthoringCatalog } from "./authoring-catalog"
import { AUTHORING_CATALOG_LIMITS, extendAuthoringCatalogWithNativeNames } from "./authoring-catalog"

export const CURRENT_DOCUMENT_DISCOVERY_DIAGNOSTIC =
  "COMPONENT_DISCOVERY_CURRENT_DOCUMENT_ONLY: Native component discovery is limited to the current document and serializable project metadata."

export type ComponentDiscoveryDiagnostic =
  | "COMPONENT_DISCOVERY_PARSE_ERROR"
  | "COMPONENT_DISCOVERY_HTML_COMMENT_ERROR"
  | `COMPONENT_DISCOVERY_${Exclude<RepoPressMdxParseFailure, "PARSE_ERROR">}`

export type ComponentDiscoveryResult = Readonly<{
  names: readonly string[]
  diagnostic?: ComponentDiscoveryDiagnostic
}>

function discoveryDiagnostic(code: RepoPressMdxParseFailure): ComponentDiscoveryDiagnostic {
  return code === "PARSE_ERROR" ? "COMPONENT_DISCOVERY_PARSE_ERROR" : `COMPONENT_DISCOVERY_${code}`
}

function isAuthorableComponentName(name: string | null | undefined): name is string {
  return typeof name === "string" && /^[A-Z_$]/.test(name)
}

function fenceBoundary(source: string, start: number) {
  let cursor = start
  let spaces = 0
  while (source[cursor] === " " && spaces < 4) {
    cursor += 1
    spaces += 1
  }
  if (spaces > 3 || (source[cursor] !== "`" && source[cursor] !== "~")) return null
  const marker = source[cursor] as "`" | "~"
  const markerStart = cursor
  while (source[cursor] === marker) cursor += 1
  const length = cursor - markerStart
  if (length < 3) return null
  let onlyWhitespaceAfter = true
  while (cursor < source.length && source[cursor] !== "\n" && source[cursor] !== "\r") {
    if (source[cursor] !== " " && source[cursor] !== "\t") onlyWhitespaceAfter = false
    cursor += 1
  }
  return { marker, length, onlyWhitespaceAfter }
}

function startsQuotedRegion(source: string, index: number): boolean {
  if (index === 0) return true
  return /[\s=([{,:]/.test(source[index - 1] ?? "")
}

function isEscaped(source: string, index: number): boolean {
  let slashes = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) slashes += 1
  return slashes % 2 === 1
}

/** Linear, position-preserving masking for actual HTML comments only. */
export function maskHtmlCommentsForDiscovery(
  source: string,
): { ok: true; source: string } | { ok: false; diagnostic: "COMPONENT_DISCOVERY_HTML_COMMENT_ERROR" } {
  let masked: string[] | null = null
  let lineStart = 0
  let protectedFenceLine = false
  let fence: { marker: "`" | "~"; length: number } | null = null
  let inlineTicks = 0
  let quote: '"' | "'" | null = null

  for (let index = 0; index < source.length; index += 1) {
    if (index === lineStart) {
      const boundary = fenceBoundary(source, lineStart)
      protectedFenceLine = fence !== null
      if (
        fence &&
        boundary?.marker === fence.marker &&
        boundary.length >= fence.length &&
        boundary.onlyWhitespaceAfter
      ) {
        fence = null
        protectedFenceLine = true
      } else if (!fence && boundary) {
        fence = { marker: boundary.marker, length: boundary.length }
        protectedFenceLine = true
      }
    }

    const character = source[index]
    if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1
      lineStart = index + 1
      protectedFenceLine = false
      continue
    }
    if (protectedFenceLine || fence) continue

    if (inlineTicks > 0) {
      if (character === "`") {
        let count = 1
        while (source[index + count] === "`") count += 1
        if (count === inlineTicks) inlineTicks = 0
        index += count - 1
      }
      continue
    }
    if (quote) {
      if (character === quote && !isEscaped(source, index)) quote = null
      continue
    }
    if ((character === '"' || character === "'") && startsQuotedRegion(source, index)) {
      quote = character
      continue
    }
    if (character === "`") {
      let count = 1
      while (source[index + count] === "`") count += 1
      inlineTicks = count
      index += count - 1
      continue
    }
    if (!source.startsWith("<!--", index)) continue

    let end = index + 4
    while (end < source.length && !source.startsWith("-->", end)) end += 1
    if (end >= source.length) return { ok: false, diagnostic: "COMPONENT_DISCOVERY_HTML_COMMENT_ERROR" }
    // Scanner positions are UTF-16 code-unit offsets; keep the buffer indexed
    // the same way so astral characters do not shift later mask ranges.
    masked ??= source.split("")
    for (let cursor = index; cursor < end + 3; cursor += 1) {
      if (masked[cursor] !== "\n" && masked[cursor] !== "\r") masked[cursor] = " "
    }
    index = end + 2
  }

  return { ok: true, source: masked?.join("") ?? source }
}

function isQuotedExample(parent: RepoPressMdxSyntaxNode | undefined, index: number): boolean {
  if (!parent?.children) return false
  const before = parent.children[index - 1]?.value
  const after = parent.children[index + 1]?.value
  if (typeof before !== "string" || typeof after !== "string") return false
  const quote = before.at(-1)
  return (quote === '"' || quote === "'") && after.startsWith(quote)
}

export function discoverMdxComponents(content: string): ComponentDiscoveryResult {
  const sourcePreflightFailure = inspectGenericSourcePreflight(content)
  if (sourcePreflightFailure) {
    return Object.freeze({
      names: Object.freeze([]),
      diagnostic: discoveryDiagnostic(sourcePreflightFailure),
    })
  }
  const masked = maskHtmlCommentsForDiscovery(content)
  if (!masked.ok) return Object.freeze({ names: Object.freeze([]), diagnostic: masked.diagnostic })
  const parsed = parseRepoPressMdxSyntax(masked.source)
  if (!parsed.ok) return Object.freeze({ names: Object.freeze([]), diagnostic: discoveryDiagnostic(parsed.code) })

  const names = new Set<string>()
  const stack: Array<{ node: RepoPressMdxSyntaxNode; parent?: RepoPressMdxSyntaxNode; index: number }> = [
    { node: parsed.root, index: 0 },
  ]
  while (stack.length > 0) {
    const entry = stack.pop()
    if (!entry) break
    const { node } = entry
    if (
      (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
      isAuthorableComponentName(node.name) &&
      !isQuotedExample(entry.parent, entry.index)
    ) {
      names.add(node.name)
      if (names.size > AUTHORING_CATALOG_LIMITS.maxComponents) {
        return Object.freeze({
          names: Object.freeze([]),
          diagnostic: "COMPONENT_DISCOVERY_SYNTAX_NODE_LIMIT" as ComponentDiscoveryDiagnostic,
        })
      }
    }
    for (let index = (node.children?.length ?? 0) - 1; index >= 0; index -= 1) {
      const child = node.children?.[index]
      if (child) stack.push({ node: child, parent: node, index })
    }
  }
  return Object.freeze({ names: Object.freeze(Array.from(names).sort(compareCodeUnits)) })
}

export type CurrentDocumentAuthoringState = Readonly<{
  authoringCatalog: AuthoringCatalog
  nativeComponentNames: readonly string[]
  diagnostics: readonly string[]
}>

function buildStateFromDiscovery(
  baseCatalog: AuthoringCatalog,
  discovery: ComponentDiscoveryResult,
  existingNativeNames: readonly string[],
  existingDiagnostics: readonly string[],
): CurrentDocumentAuthoringState {
  const nativeComponentNames = Array.from(new Set([...existingNativeNames, ...discovery.names])).sort(compareCodeUnits)
  return Object.freeze({
    authoringCatalog: extendAuthoringCatalogWithNativeNames(baseCatalog, nativeComponentNames),
    nativeComponentNames: Object.freeze(nativeComponentNames),
    diagnostics: Object.freeze([
      ...existingDiagnostics,
      CURRENT_DOCUMENT_DISCOVERY_DIAGNOSTIC,
      ...(discovery.diagnostic ? [discovery.diagnostic] : []),
    ]),
  })
}

export function buildCurrentDocumentAuthoringState(
  baseCatalog: AuthoringCatalog,
  content: string,
  existingNativeNames: readonly string[] = [],
  existingDiagnostics: readonly string[] = [],
): CurrentDocumentAuthoringState {
  return buildStateFromDiscovery(baseCatalog, discoverMdxComponents(content), existingNativeNames, existingDiagnostics)
}

export function createCurrentDocumentAuthoringStateCache() {
  let previous: { baseCatalog: AuthoringCatalog; key: string; state: CurrentDocumentAuthoringState } | undefined
  return {
    resolve(
      baseCatalog: AuthoringCatalog,
      discovery: ComponentDiscoveryResult,
      existingNativeNames: readonly string[] = [],
      existingDiagnostics: readonly string[] = [],
    ): CurrentDocumentAuthoringState {
      const key = JSON.stringify([
        ...existingNativeNames,
        "|names|",
        ...discovery.names,
        "|diagnostic|",
        discovery.diagnostic ?? "",
        "|existing-diagnostics|",
        ...existingDiagnostics,
      ])
      if (previous?.baseCatalog === baseCatalog && previous.key === key) return previous.state
      const state = buildStateFromDiscovery(baseCatalog, discovery, existingNativeNames, existingDiagnostics)
      previous = { baseCatalog, key, state }
      return state
    },
  }
}
