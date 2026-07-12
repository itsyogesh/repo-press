import remarkGfm from "remark-gfm"
import remarkMdx from "remark-mdx"
import remarkParse from "remark-parse"
import { unified } from "unified"

export type GenericInline =
  | { type: "text"; value: string }
  | { type: "strong" | "emphasis" | "delete"; children: GenericInline[] }
  | { type: "inline-code"; value: string }
  | { type: "link"; url: string; title: string | null; children: GenericInline[] }
  | { type: "image"; url: string; title: string | null; alt: string }
  | { type: "break" }
  | { type: "component-placeholder"; name: string }

export type GenericTableCell = { children: GenericInline[] }
export type GenericListItem = { blocks: GenericBlock[]; checked: boolean | null }

export type GenericBlock =
  | { type: "heading"; depth: 1 | 2 | 3 | 4 | 5 | 6; text: string; children: GenericInline[] }
  | { type: "paragraph"; children: GenericInline[] }
  | { type: "list"; ordered: boolean; start: number | null; items: GenericListItem[] }
  | { type: "blockquote"; blocks: GenericBlock[] }
  | { type: "code"; language: string | null; meta: string | null; value: string }
  | { type: "table"; align: Array<"left" | "right" | "center" | null>; rows: GenericTableCell[][] }
  | { type: "thematic-break" }
  | { type: "component-placeholder"; name: string }
  | { type: "diagnostic"; code: GenericRenderDiagnosticCode; message: string }

export type GenericRenderModel = { blocks: GenericBlock[] }

export type GenericRenderDiagnosticCode =
  | "SOURCE_BYTE_LIMIT"
  | "SOURCE_LINE_LIMIT"
  | "SOURCE_LINE_COUNT_LIMIT"
  | "SOURCE_CONTAINER_DEPTH_LIMIT"
  | "SOURCE_CONTAINER_INDENT_LIMIT"
  | "SYNTAX_NODE_LIMIT"
  | "SYNTAX_DEPTH_LIMIT"
  | "OUTPUT_NODE_LIMIT"
  | "OUTPUT_BYTE_LIMIT"
  | "MODEL_NODE_LIMIT"
  | "MODEL_DEPTH_LIMIT"
  | "MODEL_BYTE_LIMIT"
  | "INVALID_MODEL"

export const GENERIC_RENDER_LIMITS = Object.freeze({
  sourceBytes: 512 * 1024,
  syntaxNodes: 10_000,
  syntaxDepth: 64,
  outputNodes: 5_000,
  outputBytes: 256 * 1024,
  outputDepth: 64,
})

export const GENERIC_SOURCE_PREFLIGHT_LIMITS = Object.freeze({
  sourceBytes: GENERIC_RENDER_LIMITS.sourceBytes,
  lineBytes: 64 * 1024,
  lines: 20_000,
  containerDepth: 64,
  containerIndentColumns: 256,
})

type SyntaxNode = {
  type: string
  value?: string
  depth?: number
  url?: string
  title?: string | null
  alt?: string | null
  lang?: string | null
  meta?: string | null
  name?: string | null
  identifier?: string
  ordered?: boolean
  start?: number | null
  checked?: boolean | null
  align?: Array<"left" | "right" | "center" | null>
  children?: SyntaxNode[]
}

type Definition = { url: string; title: string | null }

const mdxParser = unified().use(remarkParse).use(remarkMdx).use(remarkGfm)
const URL_SCHEME = /^([A-Za-z][A-Za-z\d+.-]*):/
const SAFE_LINK_SCHEMES = new Set(["http", "https", "mailto", "tel"])
const SAFE_IMAGE_SCHEMES = new Set(["http", "https"])
const DIAGNOSTIC_CODES = new Set<GenericRenderDiagnosticCode>([
  "SOURCE_BYTE_LIMIT",
  "SOURCE_LINE_LIMIT",
  "SOURCE_LINE_COUNT_LIMIT",
  "SOURCE_CONTAINER_DEPTH_LIMIT",
  "SOURCE_CONTAINER_INDENT_LIMIT",
  "SYNTAX_NODE_LIMIT",
  "SYNTAX_DEPTH_LIMIT",
  "OUTPUT_NODE_LIMIT",
  "OUTPUT_BYTE_LIMIT",
  "MODEL_NODE_LIMIT",
  "MODEL_DEPTH_LIMIT",
  "MODEL_BYTE_LIMIT",
  "INVALID_MODEL",
])

type GenericMdxParser = { parse: (source: string) => unknown }

export function buildGenericRenderModel(source: string, parser: GenericMdxParser = mdxParser): GenericRenderModel {
  const sourcePreflightFailure = inspectGenericSourcePreflight(source)
  if (sourcePreflightFailure) return diagnosticModel(sourcePreflightFailure)

  let root: SyntaxNode
  try {
    root = parser.parse(source) as SyntaxNode
  } catch {
    // Invalid MDX fails closed: parsing the whole document as Markdown would
    // preserve import and expression source as ordinary text. Keep only inert
    // tag names discovered by the quote-aware HTML scanner.
    return finalizeBuiltModel({ blocks: rawHtmlPlaceholders(source) })
  }

  const syntaxBudgetFailure = inspectSyntaxBudget(root)
  if (syntaxBudgetFailure) return diagnosticModel(syntaxBudgetFailure)

  const definitions = collectDefinitions(root.children ?? [])
  return finalizeBuiltModel({ blocks: toBlocks(root.children ?? [], definitions) })
}

type SourcePreflightFailure =
  | "SOURCE_BYTE_LIMIT"
  | "SOURCE_LINE_LIMIT"
  | "SOURCE_LINE_COUNT_LIMIT"
  | "SOURCE_CONTAINER_DEPTH_LIMIT"
  | "SOURCE_CONTAINER_INDENT_LIMIT"

export function inspectGenericSourcePreflight(source: string): SourcePreflightFailure | null {
  let totalBytes = 0
  let lineBytes = 0
  let lineStart = 0
  let lines = 1
  let fence: { marker: "`" | "~"; length: number } | null = null

  const inspectLine = (lineEnd: number): SourcePreflightFailure | null => {
    const boundary = getFenceBoundary(source, lineStart, lineEnd)
    if (fence) {
      if (boundary?.canClose && boundary.marker === fence.marker && boundary.length >= fence.length) fence = null
    } else if (boundary) {
      fence = boundary
    } else {
      const containerFailure = inspectContainerPrefix(source, lineStart, lineEnd)
      if (containerFailure) return containerFailure
    }
    return lineBytes > GENERIC_SOURCE_PREFLIGHT_LIMITS.lineBytes ? "SOURCE_LINE_LIMIT" : null
  }

  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index)
    let width = 1
    if (code <= 0x7f) width = 1
    else if (code <= 0x7ff) width = 2
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      source.charCodeAt(index + 1) >= 0xdc00 &&
      source.charCodeAt(index + 1) <= 0xdfff
    ) {
      width = 4
      index += 1
    } else width = 3

    totalBytes += width
    if (totalBytes > GENERIC_SOURCE_PREFLIGHT_LIMITS.sourceBytes) return "SOURCE_BYTE_LIMIT"

    if (code === 0x0a || code === 0x0d) {
      const lineEnd = index
      if (code === 0x0d && source.charCodeAt(index + 1) === 0x0a) {
        totalBytes += 1
        if (totalBytes > GENERIC_SOURCE_PREFLIGHT_LIMITS.sourceBytes) return "SOURCE_BYTE_LIMIT"
        index += 1
      }
      const failure = inspectLine(lineEnd)
      if (failure) return failure
      lines += 1
      if (lines > GENERIC_SOURCE_PREFLIGHT_LIMITS.lines) return "SOURCE_LINE_COUNT_LIMIT"
      lineStart = index + 1
      lineBytes = 0
    } else {
      lineBytes += width
    }
  }

  return inspectLine(source.length)
}

function inspectContainerPrefix(
  source: string,
  lineStart: number,
  lineEnd: number,
): "SOURCE_CONTAINER_DEPTH_LIMIT" | "SOURCE_CONTAINER_INDENT_LIMIT" | null {
  let cursor = lineStart
  let depth = 0
  let indentation = 0

  while (cursor < lineEnd) {
    let whitespaceColumns = 0
    while (cursor < lineEnd) {
      const character = source[cursor]
      if (character === " ") whitespaceColumns += 1
      else if (character === "\t") whitespaceColumns += 4
      else break
      cursor += 1
    }

    const character = source[cursor]
    const listMarkerEnd = getListMarkerEnd(source, cursor, lineEnd)
    if (character !== ">" && listMarkerEnd === null) return null

    indentation += whitespaceColumns
    if (indentation > GENERIC_SOURCE_PREFLIGHT_LIMITS.containerIndentColumns) {
      return "SOURCE_CONTAINER_INDENT_LIMIT"
    }
    depth += 1
    if (depth > GENERIC_SOURCE_PREFLIGHT_LIMITS.containerDepth) return "SOURCE_CONTAINER_DEPTH_LIMIT"
    cursor = character === ">" ? cursor + 1 : (listMarkerEnd ?? cursor + 1)
  }

  return null
}

function getListMarkerEnd(source: string, start: number, end: number) {
  const marker = source[start]
  if ((marker === "-" || marker === "+" || marker === "*") && isMarkdownWhitespace(source[start + 1], start + 1, end)) {
    return start + 1
  }

  let cursor = start
  let digits = 0
  while (cursor < end && digits < 9 && /\d/.test(source[cursor] ?? "")) {
    cursor += 1
    digits += 1
  }
  if (
    digits > 0 &&
    (source[cursor] === "." || source[cursor] === ")") &&
    isMarkdownWhitespace(source[cursor + 1], cursor + 1, end)
  ) {
    return cursor + 1
  }
  return null
}

function isMarkdownWhitespace(character: string | undefined, index: number, end: number) {
  return index >= end || character === " " || character === "\t"
}

function getFenceBoundary(source: string, start: number, end: number) {
  let cursor = start
  let spaces = 0
  while (cursor < end && source[cursor] === " " && spaces < 4) {
    cursor += 1
    spaces += 1
  }
  if (spaces > 3) return null
  const rawMarker = source[cursor]
  if (rawMarker !== "`" && rawMarker !== "~") return null
  const marker: "`" | "~" = rawMarker
  const markerStart = cursor
  while (cursor < end && source[cursor] === marker) cursor += 1
  const length = cursor - markerStart
  if (length < 3) return null
  let canClose = true
  while (cursor < end) {
    if (source[cursor] !== " " && source[cursor] !== "\t") canClose = false
    cursor += 1
  }
  return { marker, length, canClose }
}

function finalizeBuiltModel(model: GenericRenderModel): GenericRenderModel {
  const outputBudgetFailure = inspectRenderModel(model)
  if (outputBudgetFailure === "MODEL_NODE_LIMIT") return diagnosticModel("OUTPUT_NODE_LIMIT")
  if (outputBudgetFailure === "MODEL_BYTE_LIMIT") return diagnosticModel("OUTPUT_BYTE_LIMIT")
  if (outputBudgetFailure) return diagnosticModel(outputBudgetFailure)
  return model
}

export function ensureRendererSafeGenericRenderModel(model: unknown): GenericRenderModel {
  const failure = inspectRenderModel(model)
  return failure ? diagnosticModel(failure) : (model as GenericRenderModel)
}

function inspectSyntaxBudget(root: SyntaxNode): "SYNTAX_NODE_LIMIT" | "SYNTAX_DEPTH_LIMIT" | null {
  const stack: Array<{ node: SyntaxNode; depth: number }> = [{ node: root, depth: 0 }]
  let nodes = 0

  while (stack.length > 0) {
    const entry = stack.pop()
    if (!entry) break
    nodes += 1
    if (nodes > GENERIC_RENDER_LIMITS.syntaxNodes) return "SYNTAX_NODE_LIMIT"
    if (entry.depth > GENERIC_RENDER_LIMITS.syntaxDepth) return "SYNTAX_DEPTH_LIMIT"
    if ((entry.node.children?.length ?? 0) > GENERIC_RENDER_LIMITS.syntaxNodes - stack.length) {
      return "SYNTAX_NODE_LIMIT"
    }
    for (let index = (entry.node.children?.length ?? 0) - 1; index >= 0; index -= 1) {
      const child = entry.node.children?.[index]
      if (child) stack.push({ node: child, depth: entry.depth + 1 })
    }
  }

  return null
}

type ModelBudgetFailure = "MODEL_NODE_LIMIT" | "MODEL_DEPTH_LIMIT" | "MODEL_BYTE_LIMIT" | "INVALID_MODEL"
type ModelStackEntry = { kind: "block" | "inline" | "item" | "cell"; value: unknown; depth: number }

function inspectRenderModel(model: unknown): ModelBudgetFailure | null {
  if (!isRecord(model) || !Array.isArray(model.blocks)) return "INVALID_MODEL"

  const stack: ModelStackEntry[] = []
  if (!pushEntries(stack, "block", model.blocks, 1)) return "MODEL_NODE_LIMIT"

  const seen = new WeakSet<object>()
  let nodes = 0
  let textBytes = 0
  const addText = (value: string | null | undefined) => {
    if (value === null || value === undefined) return true
    const remaining = GENERIC_RENDER_LIMITS.outputBytes - textBytes
    if (utf8ByteLengthExceeds(value, remaining)) return false
    textBytes += utf8ByteLength(value)
    return true
  }

  while (stack.length > 0) {
    const entry = stack.pop()
    if (!entry) break
    if (!isRecord(entry.value) || seen.has(entry.value)) return "INVALID_MODEL"
    seen.add(entry.value)
    nodes += 1
    if (nodes > GENERIC_RENDER_LIMITS.outputNodes) return "MODEL_NODE_LIMIT"
    if (entry.depth > GENERIC_RENDER_LIMITS.outputDepth) return "MODEL_DEPTH_LIMIT"

    if (entry.kind === "item") {
      if (!Array.isArray(entry.value.blocks)) return "INVALID_MODEL"
      if (entry.value.checked !== null && typeof entry.value.checked !== "boolean") return "INVALID_MODEL"
      if (!pushEntries(stack, "block", entry.value.blocks, entry.depth + 1)) return "MODEL_NODE_LIMIT"
      continue
    }
    if (entry.kind === "cell") {
      if (!Array.isArray(entry.value.children)) return "INVALID_MODEL"
      if (!pushEntries(stack, "inline", entry.value.children, entry.depth + 1)) return "MODEL_NODE_LIMIT"
      continue
    }

    const type = entry.value.type
    if (typeof type !== "string") return "INVALID_MODEL"
    if (entry.kind === "inline") {
      if (type === "text" || type === "inline-code") {
        if (typeof entry.value.value !== "string") return "INVALID_MODEL"
        if (!addText(entry.value.value)) return "MODEL_BYTE_LIMIT"
      } else if (type === "strong" || type === "emphasis" || type === "delete") {
        if (!Array.isArray(entry.value.children)) return "INVALID_MODEL"
        if (!pushEntries(stack, "inline", entry.value.children, entry.depth + 1)) return "MODEL_NODE_LIMIT"
      } else if (type === "link") {
        if (
          typeof entry.value.url !== "string" ||
          safeUrl(entry.value.url, "link") !== entry.value.url ||
          !isNullableString(entry.value.title)
        ) {
          return "INVALID_MODEL"
        }
        if (!addText(entry.value.url) || !addText(entry.value.title) || !Array.isArray(entry.value.children)) {
          return Array.isArray(entry.value.children) ? "MODEL_BYTE_LIMIT" : "INVALID_MODEL"
        }
        if (!pushEntries(stack, "inline", entry.value.children, entry.depth + 1)) return "MODEL_NODE_LIMIT"
      } else if (type === "image") {
        if (
          typeof entry.value.url !== "string" ||
          safeUrl(entry.value.url, "image") !== entry.value.url ||
          !isNullableString(entry.value.title) ||
          typeof entry.value.alt !== "string"
        ) {
          return "INVALID_MODEL"
        }
        if (!addText(entry.value.url) || !addText(entry.value.title) || !addText(entry.value.alt)) {
          return "MODEL_BYTE_LIMIT"
        }
      } else if (type === "component-placeholder") {
        if (typeof entry.value.name !== "string" || safeComponentName(entry.value.name) !== entry.value.name) {
          return "INVALID_MODEL"
        }
        if (!addText(entry.value.name)) return "MODEL_BYTE_LIMIT"
      } else if (type !== "break") {
        return "INVALID_MODEL"
      }
      continue
    }

    if (type === "heading") {
      if (
        !Number.isInteger(entry.value.depth) ||
        (entry.value.depth as number) < 1 ||
        (entry.value.depth as number) > 6 ||
        typeof entry.value.text !== "string" ||
        !Array.isArray(entry.value.children)
      ) {
        return "INVALID_MODEL"
      }
      if (!addText(entry.value.text) || !Array.isArray(entry.value.children)) return "MODEL_BYTE_LIMIT"
      if (!pushEntries(stack, "inline", entry.value.children, entry.depth + 1)) return "MODEL_NODE_LIMIT"
    } else if (type === "paragraph") {
      if (!Array.isArray(entry.value.children)) return "INVALID_MODEL"
      if (!pushEntries(stack, "inline", entry.value.children, entry.depth + 1)) return "MODEL_NODE_LIMIT"
    } else if (type === "list") {
      if (
        typeof entry.value.ordered !== "boolean" ||
        (entry.value.start !== null && (!Number.isInteger(entry.value.start) || (entry.value.start as number) < 1)) ||
        !Array.isArray(entry.value.items)
      ) {
        return "INVALID_MODEL"
      }
      if (!pushEntries(stack, "item", entry.value.items, entry.depth + 1)) return "MODEL_NODE_LIMIT"
    } else if (type === "blockquote") {
      if (!Array.isArray(entry.value.blocks)) return "INVALID_MODEL"
      if (!pushEntries(stack, "block", entry.value.blocks, entry.depth + 1)) return "MODEL_NODE_LIMIT"
    } else if (type === "code") {
      if (
        !isNullableString(entry.value.language) ||
        !isNullableString(entry.value.meta) ||
        typeof entry.value.value !== "string"
      ) {
        return "INVALID_MODEL"
      }
      if (!addText(entry.value.language) || !addText(entry.value.meta) || !addText(entry.value.value)) {
        return "MODEL_BYTE_LIMIT"
      }
    } else if (type === "table") {
      if (
        !Array.isArray(entry.value.align) ||
        !entry.value.align.every(
          (align) => align === null || align === "left" || align === "right" || align === "center",
        ) ||
        !Array.isArray(entry.value.rows)
      ) {
        return "INVALID_MODEL"
      }
      for (let rowIndex = entry.value.rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
        const row = entry.value.rows[rowIndex]
        if (!Array.isArray(row)) return "INVALID_MODEL"
        if (!pushEntries(stack, "cell", row, entry.depth + 1)) return "MODEL_NODE_LIMIT"
      }
    } else if (type === "component-placeholder") {
      if (typeof entry.value.name !== "string" || safeComponentName(entry.value.name) !== entry.value.name) {
        return "INVALID_MODEL"
      }
      if (!addText(entry.value.name)) return "MODEL_BYTE_LIMIT"
    } else if (type === "diagnostic") {
      if (
        typeof entry.value.code !== "string" ||
        !DIAGNOSTIC_CODES.has(entry.value.code as GenericRenderDiagnosticCode) ||
        typeof entry.value.message !== "string"
      ) {
        return "INVALID_MODEL"
      }
      if (!addText(entry.value.code) || !addText(entry.value.message)) return "MODEL_BYTE_LIMIT"
    } else if (type !== "thematic-break") {
      return "INVALID_MODEL"
    }
  }

  return null
}

function pushEntries(stack: ModelStackEntry[], kind: ModelStackEntry["kind"], values: unknown[], depth: number) {
  if (values.length > GENERIC_RENDER_LIMITS.outputNodes - stack.length) return false
  for (let index = values.length - 1; index >= 0; index -= 1) {
    stack.push({ kind, value: values[index], depth })
  }
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function diagnosticModel(code: GenericRenderDiagnosticCode): GenericRenderModel {
  const messages: Record<GenericRenderDiagnosticCode, string> = {
    SOURCE_BYTE_LIMIT: "Generic preview is unavailable because this document exceeds the safe source-size limit.",
    SOURCE_LINE_LIMIT: "Generic preview is unavailable because this document contains an excessively long line.",
    SOURCE_LINE_COUNT_LIMIT: "Generic preview is unavailable because this document contains too many lines.",
    SOURCE_CONTAINER_DEPTH_LIMIT:
      "Generic preview is unavailable because this document contains excessive container nesting.",
    SOURCE_CONTAINER_INDENT_LIMIT:
      "Generic preview is unavailable because this document contains excessive container indentation.",
    SYNTAX_NODE_LIMIT: "Generic preview is unavailable because this document has too many syntax nodes.",
    SYNTAX_DEPTH_LIMIT: "Generic preview is unavailable because this document is nested too deeply.",
    OUTPUT_NODE_LIMIT: "Generic preview is unavailable because the safe render node limit was exceeded.",
    OUTPUT_BYTE_LIMIT: "Generic preview is unavailable because the safe render output limit was exceeded.",
    MODEL_NODE_LIMIT: "Generic preview was blocked because its render model has too many nodes.",
    MODEL_DEPTH_LIMIT: "Generic preview was blocked because its render model is nested too deeply.",
    MODEL_BYTE_LIMIT: "Generic preview was blocked because its render model is too large.",
    INVALID_MODEL: "Generic preview was blocked because its render model is invalid.",
  }
  return { blocks: [{ type: "diagnostic", code, message: messages[code] }] }
}

function utf8ByteLengthExceeds(value: string, limit: number) {
  return utf8ByteLength(value, limit) > limit
}

function utf8ByteLength(value: string, stopAfter = Number.POSITIVE_INFINITY) {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x7f) bytes += 1
    else if (code <= 0x7ff) bytes += 2
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4
      index += 1
    } else bytes += 3
    if (bytes > stopAfter) return bytes
  }
  return bytes
}

function toBlocks(nodes: SyntaxNode[], definitions: Map<string, Definition>): GenericBlock[] {
  const blocks: GenericBlock[] = []

  for (const node of nodes) {
    switch (node.type) {
      case "heading": {
        const children = toInlines(node.children ?? [], definitions)
        blocks.push({
          type: "heading",
          depth: normalizeHeadingDepth(node.depth),
          text: inlineText(children),
          children,
        })
        break
      }
      case "paragraph": {
        const children = toInlines(node.children ?? [], definitions)
        if (children.length > 0 && children.every((child) => child.type === "component-placeholder")) {
          blocks.push(...children)
        } else if (children.length > 0) {
          blocks.push({ type: "paragraph", children })
        }
        break
      }
      case "list":
        blocks.push({
          type: "list",
          ordered: node.ordered === true,
          start: node.ordered === true && typeof node.start === "number" ? node.start : null,
          items: (node.children ?? []).map((item) => ({
            blocks: toBlocks(item.children ?? [], definitions),
            checked: typeof item.checked === "boolean" ? item.checked : null,
          })),
        })
        break
      case "blockquote":
        blocks.push({ type: "blockquote", blocks: toBlocks(node.children ?? [], definitions) })
        break
      case "code":
        blocks.push({
          type: "code",
          language: cleanOptionalText(node.lang),
          meta: cleanOptionalText(node.meta),
          value: node.value ?? "",
        })
        break
      case "table":
        blocks.push({
          type: "table",
          align: node.align ?? [],
          rows: (node.children ?? []).map((row) =>
            (row.children ?? []).map((cell) => ({ children: toInlines(cell.children ?? [], definitions) })),
          ),
        })
        break
      case "thematicBreak":
        blocks.push({ type: "thematic-break" })
        break
      case "mdxJsxFlowElement":
        blocks.push({ type: "component-placeholder", name: safeComponentName(node.name) })
        break
      case "html":
        blocks.push(...rawHtmlPlaceholders(node.value ?? ""))
        break
      default:
        // MDX expressions and ESM nodes are intentionally omitted. Keeping
        // their source would make the supposedly safe model an execution input.
        break
    }
  }

  return blocks
}

function toInlines(nodes: SyntaxNode[], definitions: Map<string, Definition>): GenericInline[] {
  const inlines: GenericInline[] = []

  for (const node of nodes) {
    switch (node.type) {
      case "text":
        if (node.value) inlines.push({ type: "text", value: node.value })
        break
      case "strong":
      case "emphasis":
      case "delete": {
        const children = toInlines(node.children ?? [], definitions)
        if (children.length > 0) inlines.push({ type: node.type, children })
        break
      }
      case "inlineCode":
        inlines.push({ type: "inline-code", value: node.value ?? "" })
        break
      case "link": {
        const children = toInlines(node.children ?? [], definitions)
        const url = safeUrl(node.url, "link")
        if (url) inlines.push({ type: "link", url, title: cleanOptionalText(node.title), children })
        else inlines.push(...children)
        break
      }
      case "linkReference": {
        const children = toInlines(node.children ?? [], definitions)
        const definition = definitions.get(normalizeIdentifier(node.identifier))
        const url = safeUrl(definition?.url, "link")
        if (url) inlines.push({ type: "link", url, title: definition?.title ?? null, children })
        else inlines.push(...children)
        break
      }
      case "imageReference": {
        const alt = node.alt ?? ""
        const definition = definitions.get(normalizeIdentifier(node.identifier))
        const url = safeUrl(definition?.url, "image")
        if (url) inlines.push({ type: "image", url, title: definition?.title ?? null, alt })
        else if (alt) inlines.push({ type: "text", value: alt })
        break
      }
      case "image": {
        const alt = node.alt ?? ""
        const url = safeUrl(node.url, "image")
        if (url) inlines.push({ type: "image", url, title: cleanOptionalText(node.title), alt })
        else if (alt) inlines.push({ type: "text", value: alt })
        break
      }
      case "break":
        inlines.push({ type: "break" })
        break
      case "mdxJsxTextElement":
        inlines.push({ type: "component-placeholder", name: safeComponentName(node.name) })
        break
      case "html":
        inlines.push(...rawHtmlPlaceholders(node.value ?? ""))
        break
      default:
        // In particular, mdxTextExpression is intentionally discarded.
        break
    }
  }

  return inlines
}

function collectDefinitions(nodes: SyntaxNode[]) {
  const definitions = new Map<string, Definition>()
  for (const node of nodes) {
    if (node.type !== "definition" || !node.identifier || !node.url) continue
    definitions.set(normalizeIdentifier(node.identifier), {
      url: node.url,
      title: cleanOptionalText(node.title),
    })
  }
  return definitions
}

function normalizeIdentifier(identifier: string | undefined) {
  return (identifier ?? "").trim().replace(/\s+/g, " ").toLowerCase()
}

function safeUrl(value: string | undefined, kind: "link" | "image") {
  const url = value?.trim()
  if (!url || hasControlCharacter(url) || url.startsWith("//")) return null
  const scheme = URL_SCHEME.exec(url)?.[1]?.toLowerCase()
  if (!scheme) return url
  return (kind === "link" ? SAFE_LINK_SCHEMES : SAFE_IMAGE_SCHEMES).has(scheme) ? url : null
}

function hasControlCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function rawHtmlPlaceholders(value: string): Array<{ type: "component-placeholder"; name: string }> {
  const placeholders: Array<{ type: "component-placeholder"; name: string }> = []
  const seen = new Set<string>()
  let cursor = 0

  while (cursor < value.length) {
    const open = value.indexOf("<", cursor)
    if (open === -1) break
    let index = open + 1
    const closing = value[index] === "/"
    if (closing) index += 1

    const nameStart = index
    while (index < value.length && /[A-Za-z0-9._:-]/.test(value[index] ?? "")) index += 1
    const name = value.slice(nameStart, index)
    if (!closing && /^[A-Za-z][A-Za-z0-9._:-]*$/.test(name) && !seen.has(name)) {
      seen.add(name)
      placeholders.push({ type: "component-placeholder", name })
    }

    let quote: '"' | "'" | null = null
    while (index < value.length) {
      const character = value[index]
      if (quote) {
        if (character === quote) quote = null
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === ">") {
        index += 1
        break
      }
      index += 1
    }
    cursor = Math.max(index, open + 1)
  }
  return placeholders
}

function safeComponentName(name: string | null | undefined) {
  return name && /^[A-Za-z][A-Za-z0-9._:-]*$/.test(name) ? name : "AnonymousComponent"
}

function cleanOptionalText(value: string | null | undefined) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function normalizeHeadingDepth(value: number | undefined): 1 | 2 | 3 | 4 | 5 | 6 {
  return value === 2 || value === 3 || value === 4 || value === 5 || value === 6 ? value : 1
}

function inlineText(inlines: GenericInline[]): string {
  return inlines
    .map((inline) => {
      if (inline.type === "text" || inline.type === "inline-code") return inline.value
      if (
        inline.type === "link" ||
        inline.type === "strong" ||
        inline.type === "emphasis" ||
        inline.type === "delete"
      ) {
        return inlineText(inline.children)
      }
      if (inline.type === "image") return inline.alt
      return ""
    })
    .join("")
}
