import * as React from "react"

export const COMPATIBLE_RENDER_MAX_NODES = 2_048
export const COMPATIBLE_RENDER_MAX_DEPTH = 32
export const COMPATIBLE_RENDER_MAX_CHILDREN = 128
export const COMPATIBLE_RENDER_MAX_TEXT_BYTES = 192 * 1024
const COMPATIBLE_RENDER_MAX_ATTRIBUTES = 16
const COMPATIBLE_RENDER_MAX_ATTRIBUTE_BYTES = 1_024

const ALLOWED_TAGS = new Set([
  "article",
  "aside",
  "blockquote",
  "br",
  "code",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "kbd",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
])

const DROP_CONTENT_TAGS = new Set([
  "audio",
  "base",
  "canvas",
  "embed",
  "iframe",
  "img",
  "link",
  "math",
  "meta",
  "noscript",
  "object",
  "script",
  "source",
  "style",
  "svg",
  "template",
  "track",
  "video",
])

const ALLOWED_STRING_ATTRIBUTES = new Set([
  "aria-description",
  "aria-label",
  "aria-live",
  "className",
  "role",
  "scope",
  "title",
])
const ALLOWED_BOOLEAN_ATTRIBUTES = new Set(["aria-hidden"])
const ALLOWED_NUMBER_ATTRIBUTES = new Set(["colSpan", "rowSpan", "start"])
const CLASS_TOKEN_PATTERN = /^[A-Za-z0-9_:/.[\]%-]+$/

export type CompatibleRenderNode =
  | Readonly<{ kind: "text"; value: string }>
  | Readonly<{
      kind: "element"
      tag: string
      props: Readonly<Record<string, string | number | boolean>>
      children: readonly CompatibleRenderNode[]
    }>
export type CompatibleRenderTree = readonly CompatibleRenderNode[]

function ownData(input: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key)
  if (!descriptor || descriptor.get || descriptor.set) throw new TypeError("Render nodes must contain inert data")
  return descriptor.value
}

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false
  const prototype = Object.getPrototypeOf(input)
  return prototype === Object.prototype || prototype === null
}

function utf8BytesWithin(value: string, limit: number): number | null {
  if (value.length > limit) return null
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit <= 0x7f) bytes += 1
    else if (unit <= 0x7ff) bytes += 2
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else bytes += 3
    } else bytes += 3
    if (bytes > limit) return null
  }
  return bytes
}

function sanitizeClassName(value: string): string | null {
  if (value.length === 0 || value.length > 512) return null
  const tokens = value.split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || tokens.length > 32) return null
  return tokens.every((token) => token.length <= 64 && CLASS_TOKEN_PATTERN.test(token)) ? tokens.join(" ") : null
}

function sanitizeProps(input: unknown): Readonly<Record<string, string | number | boolean>> {
  if (!isPlainRecord(input)) return Object.freeze({})
  const output: Record<string, string | number | boolean> = Object.create(null)
  let attributeCount = 0
  for (const key in input) {
    if (!Object.hasOwn(input, key)) continue
    attributeCount += 1
    if (attributeCount > COMPATIBLE_RENDER_MAX_ATTRIBUTES) throw new RangeError("Too many render attributes")
    if (key === "__proto__" || key === "prototype" || key === "constructor") continue
    const value = ownData(input, key)
    if (ALLOWED_STRING_ATTRIBUTES.has(key) && typeof value === "string") {
      if (utf8BytesWithin(value, COMPATIBLE_RENDER_MAX_ATTRIBUTE_BYTES) === null) continue
      if (key === "className") {
        const className = sanitizeClassName(value)
        if (className) output.className = className
      } else {
        output[key] = value
      }
    } else if (ALLOWED_BOOLEAN_ATTRIBUTES.has(key) && typeof value === "boolean") {
      output[key] = value
    } else if (
      ALLOWED_NUMBER_ATTRIBUTES.has(key) &&
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 1 &&
      value <= 1_000
    ) {
      output[key] = value
    }
  }
  return Object.freeze(output)
}

function deepFreezeNode(node: CompatibleRenderNode): CompatibleRenderNode {
  if (node.kind === "element") {
    for (const child of node.children) deepFreezeNode(child)
    Object.freeze(node.children)
  }
  return Object.freeze(node)
}

export function sanitizeCompatibleRenderTree(input: unknown): CompatibleRenderTree | null {
  if (!Array.isArray(input)) return null
  const budget = { nodes: 0, textBytes: 0 }

  const visit = (value: unknown, depth: number): CompatibleRenderNode[] => {
    if (depth > COMPATIBLE_RENDER_MAX_DEPTH) throw new RangeError("Compatible render tree is too deep")
    if (!isPlainRecord(value)) throw new TypeError("Compatible render nodes must be plain objects")
    budget.nodes += 1
    if (budget.nodes > COMPATIBLE_RENDER_MAX_NODES) throw new RangeError("Compatible render tree has too many nodes")
    const kind = ownData(value, "kind")
    if (kind === "text") {
      const text = ownData(value, "value")
      if (typeof text !== "string") throw new TypeError("Compatible text nodes require strings")
      const remaining = COMPATIBLE_RENDER_MAX_TEXT_BYTES - budget.textBytes
      const bytes = utf8BytesWithin(text, remaining)
      if (bytes === null) throw new RangeError("Compatible render text exceeds its budget")
      budget.textBytes += bytes
      return [{ kind: "text", value: text }]
    }
    if (kind !== "element") throw new TypeError("Unknown compatible render node")
    const tagValue = ownData(value, "tag")
    const childValues = ownData(value, "children")
    if (typeof tagValue !== "string" || !Array.isArray(childValues)) {
      throw new TypeError("Compatible element nodes require a tag and children")
    }
    if (childValues.length > COMPATIBLE_RENDER_MAX_CHILDREN) {
      throw new RangeError("Compatible render node has too many children")
    }
    if (DROP_CONTENT_TAGS.has(tagValue.toLowerCase())) return []
    const children = childValues.flatMap((child) => visit(child, depth + 1))
    const tag = tagValue.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return children
    const props = sanitizeProps(ownData(value, "props"))
    return [{ kind: "element", tag, props, children }]
  }

  try {
    if (input.length > COMPATIBLE_RENDER_MAX_CHILDREN) return null
    const tree = input.flatMap((node) => visit(node, 1))
    for (const node of tree) deepFreezeNode(node)
    return Object.freeze(tree)
  } catch {
    return null
  }
}

function renderNode(node: CompatibleRenderNode, key: string): React.ReactNode {
  if (node.kind === "text") return node.value
  if (!ALLOWED_TAGS.has(node.tag)) return null
  return React.createElement(
    node.tag,
    { ...node.props, key },
    node.children.map((child, index) => renderNode(child, `${key}.${index}`)),
  )
}

export function CompatibleRenderTreeView({ tree }: { tree: CompatibleRenderTree }) {
  return <>{tree.map((node, index) => renderNode(node, String(index)))}</>
}
