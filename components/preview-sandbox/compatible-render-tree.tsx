import * as React from "react"
import { type CompatibleFidelityLossCode, mergeCompatibleFidelityLosses } from "@/lib/preview/compatible-diagnostics"
import { sanitizeCompatibleImageSource } from "@/lib/preview/image-source-policy"
import {
  PREVIEW_IMAGE_ASPECTS,
  PREVIEW_IMAGE_TEXT_MAX_BYTES,
  type PreviewImageAspect,
} from "@/lib/preview/preview-capabilities"

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
const VOID_TAGS = new Set(["br", "hr"])

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
const MEDIA_TAGS = new Set(["audio", "canvas", "img", "source", "track", "video"])
const FRAME_TAGS = new Set(["embed", "iframe", "object"])
const FORM_TAGS = new Set([
  "button",
  "datalist",
  "fieldset",
  "form",
  "input",
  "label",
  "legend",
  "option",
  "select",
  "textarea",
])
const NAVIGATION_TAGS = new Set(["a", "nav"])
const NETWORK_TAGS = new Set(["base", "link", "meta"])
const ACTIVE_CONTENT_TAGS = new Set(["math", "noscript", "script", "style", "svg", "template"])

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
      kind: "action"
      label: string
      destination?: string
      tone: "primary" | "secondary"
    }>
  | Readonly<{
      kind: "image"
      source: string
      alt: string
      label: string
      aspect: PreviewImageAspect
    }>
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

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit <= 0x1f || (unit >= 0x7f && unit <= 0x9f)) return true
  }
  return false
}

export { sanitizeCompatibleImageSource }

export function sanitizeCompatibleActionDestination(input: unknown): string | null {
  if (typeof input !== "string" || input.length === 0 || utf8BytesWithin(input, 2_048) === null) return null
  if (input.trim() !== input || /[\s\\]/u.test(input) || containsControlCharacter(input)) return null
  if (/^https:\/\//iu.test(input)) return sanitizeCompatibleImageSource(input)

  let current = input
  for (let round = 0; round <= 3; round += 1) {
    const path = current.split(/[?#]/u, 1)[0] ?? ""
    if (
      /^\/\//u.test(current) ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(current) ||
      /[\\\s]/u.test(current) ||
      containsControlCharacter(current) ||
      /(?:^|\/)\.{1,2}(?:\/|$)/u.test(path)
    )
      return null
    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      return null
    }
    if (decoded === current) return input
    if (round === 3) return null
    current = decoded
  }
  return null
}

function sanitizeImageText(input: unknown, fallback: string): string {
  return typeof input === "string" &&
    input.length > 0 &&
    utf8BytesWithin(input, PREVIEW_IMAGE_TEXT_MAX_BYTES) !== null &&
    !containsControlCharacter(input)
    ? input
    : fallback
}

function imagePlaceholderInput(alt: string, label: string, aspect: PreviewImageAspect) {
  return {
    kind: "element",
    tag: "figure",
    props: {
      className: `repopress-preview-image repopress-preview-image--${aspect}`,
      role: "img",
      "aria-label": alt,
    },
    children: [
      {
        kind: "element",
        tag: "div",
        props: { className: "repopress-preview-image-surface" },
        children: [
          {
            kind: "element",
            tag: "span",
            props: { className: "repopress-preview-icon repopress-preview-icon--image", "aria-hidden": true },
            children: [{ kind: "text", value: "▧" }],
          },
        ],
      },
      {
        kind: "element",
        tag: "figcaption",
        props: {},
        children: [{ kind: "text", value: label }],
      },
    ],
  }
}

function sanitizeClassName(value: string): string | null {
  if (value.length === 0 || value.length > 512) return null
  const tokens = value.split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || tokens.length > 32) return null
  return tokens.every((token) => token.length <= 64 && CLASS_TOKEN_PATTERN.test(token)) ? tokens.join(" ") : null
}

function sanitizeProps(
  input: unknown,
  losses: Set<CompatibleFidelityLossCode>,
): Readonly<Record<string, string | number | boolean>> {
  if (!isPlainRecord(input)) return Object.freeze({})
  const output: Record<string, string | number | boolean> = Object.create(null)
  let attributeCount = 0
  for (const key in input) {
    if (!Object.hasOwn(input, key)) continue
    attributeCount += 1
    if (attributeCount > COMPATIBLE_RENDER_MAX_ATTRIBUTES) throw new RangeError("Too many render attributes")
    if (key === "__proto__" || key === "prototype" || key === "constructor") continue
    const value = ownData(input, key)
    if (/^on[A-Z]/.test(key)) {
      losses.add("STATIC_INERT_EVENT")
      continue
    }
    if (key === "ref") {
      losses.add("STATIC_INERT_REF")
      continue
    }
    if (key === "style" || key === "dangerouslySetInnerHTML") {
      losses.add("STATIC_INERT_STYLE")
      continue
    }
    if (ALLOWED_STRING_ATTRIBUTES.has(key) && typeof value === "string") {
      if (utf8BytesWithin(value, COMPATIBLE_RENDER_MAX_ATTRIBUTE_BYTES) === null) continue
      if (key === "className") {
        const className = sanitizeClassName(value)
        if (className) output.className = className
        else losses.add("STATIC_INERT_CLASS")
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
    } else {
      losses.add("STATIC_INERT_PROP")
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

export function sanitizeCompatibleRenderTreeWithDiagnostics(
  input: unknown,
): Readonly<{ tree: CompatibleRenderTree; fidelityLosses: readonly CompatibleFidelityLossCode[] }> | null {
  if (!Array.isArray(input)) return null
  const budget = { nodes: 0, textBytes: 0 }
  const losses = new Set<CompatibleFidelityLossCode>()

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
    if (kind === "action") {
      const rawLabel = ownData(value, "label")
      const rawTone = ownData(value, "tone")
      const label = sanitizeImageText(rawLabel, "Preview action")
      const remaining = COMPATIBLE_RENDER_MAX_TEXT_BYTES - budget.textBytes
      const labelBytes = utf8BytesWithin(label, remaining)
      if (labelBytes === null) throw new RangeError("Compatible render text exceeds its budget")
      budget.textBytes += labelBytes
      const tone = rawTone === "secondary" ? "secondary" : "primary"
      const destination = sanitizeCompatibleActionDestination(
        Object.hasOwn(value, "destination") ? ownData(value, "destination") : undefined,
      )
      return [{ kind: "action", label, ...(destination ? { destination } : {}), tone }]
    }
    if (kind === "image") {
      const alt = sanitizeImageText(ownData(value, "alt"), "Image preview")
      const label = sanitizeImageText(ownData(value, "label"), alt)
      const rawAspect = ownData(value, "aspect")
      const aspect = PREVIEW_IMAGE_ASPECTS.includes(rawAspect as PreviewImageAspect)
        ? (rawAspect as PreviewImageAspect)
        : "wide"
      const source = sanitizeCompatibleImageSource(ownData(value, "source"))
      if (!source) return visit(imagePlaceholderInput(alt, label, aspect), depth)
      return [{ kind: "image", source, alt, label, aspect }]
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
    const rawTag = tagValue.toLowerCase()
    if (MEDIA_TAGS.has(rawTag)) losses.add("STATIC_INERT_MEDIA")
    if (FRAME_TAGS.has(rawTag)) losses.add("STATIC_INERT_FRAME")
    if (FORM_TAGS.has(rawTag)) losses.add("STATIC_INERT_FORM")
    if (NAVIGATION_TAGS.has(rawTag)) losses.add("STATIC_INERT_LINK")
    if (rawTag === "nav") losses.add("STATIC_INERT_NAVIGATION")
    if (NETWORK_TAGS.has(rawTag)) losses.add("STATIC_INERT_NETWORK_ELEMENT")
    if (ACTIVE_CONTENT_TAGS.has(rawTag)) losses.add("STATIC_INERT_ACTIVE_CONTENT")
    const props = sanitizeProps(ownData(value, "props"), losses)
    if (DROP_CONTENT_TAGS.has(rawTag)) return []
    const children = childValues.flatMap((child) => visit(child, depth + 1))
    const tag = rawTag
    if (!ALLOWED_TAGS.has(tag)) {
      if (!NAVIGATION_TAGS.has(tag) && !FORM_TAGS.has(tag)) losses.add("STATIC_INERT_UNSUPPORTED_ELEMENT")
      return children
    }
    return [{ kind: "element", tag, props, children }]
  }

  try {
    if (input.length > COMPATIBLE_RENDER_MAX_CHILDREN) return null
    const tree = input.flatMap((node) => visit(node, 1))
    for (const node of tree) deepFreezeNode(node)
    return Object.freeze({ tree: Object.freeze(tree), fidelityLosses: mergeCompatibleFidelityLosses([...losses]) })
  } catch {
    return null
  }
}

export function sanitizeCompatibleRenderTree(input: unknown): CompatibleRenderTree | null {
  return sanitizeCompatibleRenderTreeWithDiagnostics(input)?.tree ?? null
}

export type CompatibleAssetFailureReason = "load-failed" | "decode-failed"

function renderNode(
  node: CompatibleRenderNode,
  key: string,
  assetUrls: ReadonlyMap<string, string>,
  assetFailures: ReadonlyMap<string, string>,
  onAssetFailure?: (source: string, assetUrl: string, reason: CompatibleAssetFailureReason) => void,
  onAction?: (action: Extract<CompatibleRenderNode, { kind: "action" }>) => void,
): React.ReactNode {
  if (node.kind === "text") return node.value
  if (node.kind === "action") {
    return (
      <button
        key={key}
        type="button"
        aria-label={node.label}
        className={`repopress-preview-action repopress-preview-action--${node.tone}`}
        onClick={() => onAction?.(node)}
      >
        {node.label}
        <small>Preview action</small>
      </button>
    )
  }
  if (node.kind === "image") {
    const mappedAssetUrl = assetUrls.get(node.source)
    const failure = assetFailures.get(node.source)
    const assetUrl = !failure && mappedAssetUrl?.startsWith("blob:") ? mappedAssetUrl : undefined
    return (
      <figure
        key={key}
        className={`repopress-preview-image repopress-preview-image--${node.aspect}`}
        role={assetUrl ? undefined : "img"}
        aria-label={assetUrl ? undefined : failure ? `${node.alt} — image unavailable` : node.alt}
        data-preview-asset-status={failure ? "failed" : assetUrl ? "ready" : "pending"}
        data-preview-asset-diagnostic={failure}
      >
        {assetUrl ? (
          <img
            className="repopress-preview-image-surface"
            src={assetUrl}
            alt={node.alt}
            onError={() => onAssetFailure?.(node.source, assetUrl, "load-failed")}
            onLoad={(event) => {
              const image = event.currentTarget
              if (typeof image.decode !== "function") return
              void image.decode().catch(() => onAssetFailure?.(node.source, assetUrl, "decode-failed"))
            }}
          />
        ) : (
          <div className="repopress-preview-image-surface">
            <span className="repopress-preview-icon repopress-preview-icon--image" aria-hidden="true">
              ▧
            </span>
            {failure ? <span>Image unavailable</span> : null}
          </div>
        )}
        <figcaption>{node.label}</figcaption>
      </figure>
    )
  }
  if (!ALLOWED_TAGS.has(node.tag)) return null
  if (VOID_TAGS.has(node.tag)) return React.createElement(node.tag, { ...node.props, key })
  return React.createElement(
    node.tag,
    { ...node.props, key },
    node.children.map((child, index) =>
      renderNode(child, `${key}.${index}`, assetUrls, assetFailures, onAssetFailure, onAction),
    ),
  )
}

export function CompatibleRenderTreeView({
  tree,
  assetUrls = new Map(),
  assetFailures = new Map(),
  onAssetFailure,
}: {
  tree: CompatibleRenderTree
  assetUrls?: ReadonlyMap<string, string>
  assetFailures?: ReadonlyMap<string, string>
  onAssetFailure?: (source: string, assetUrl: string, reason: CompatibleAssetFailureReason) => void
}) {
  const [actionSelection, setActionSelection] = React.useState<{
    tree: CompatibleRenderTree
    action: Extract<CompatibleRenderNode, { kind: "action" }>
  } | null>(null)
  const selectedAction = actionSelection?.tree === tree ? actionSelection.action : null
  const selectAction = React.useCallback(
    (action: Extract<CompatibleRenderNode, { kind: "action" }>) => setActionSelection({ tree, action }),
    [tree],
  )
  return (
    <div data-compatible-preview>
      {tree.map((node, index) =>
        renderNode(node, String(index), assetUrls, assetFailures, onAssetFailure, selectAction),
      )}
      {selectedAction ? (
        <output className="repopress-preview-action-explanation">
          <strong>Published action</strong>
          <span>
            {selectedAction.destination
              ? `Would open ${selectedAction.destination}`
              : "No destination is configured. Update the component's action prop."}
          </span>
        </output>
      ) : null}
    </div>
  )
}
