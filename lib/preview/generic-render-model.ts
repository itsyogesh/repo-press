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

export type GenericRenderModel = { blocks: GenericBlock[] }

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

export function buildGenericRenderModel(source: string): GenericRenderModel {
  let root: SyntaxNode
  try {
    root = mdxParser.parse(source) as SyntaxNode
  } catch {
    // Invalid MDX fails closed: parsing the whole document as Markdown would
    // preserve import and expression source as ordinary text. Keep only inert
    // tag names discovered by the quote-aware HTML scanner.
    return { blocks: rawHtmlPlaceholders(source) }
  }

  const definitions = collectDefinitions(root.children ?? [])
  return { blocks: toBlocks(root.children ?? [], definitions) }
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
