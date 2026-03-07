// ---------------------------------------------------------------------------
// Component Serializer — deterministic JSX output from ComponentNode
// ---------------------------------------------------------------------------
//
// Contract:
//   1. Deterministic — same input always produces identical output.
//   2. Prop ordering — lexicographic by prop name.
//   3. Self-closing nodes — single-line JSX (`<Foo bar="baz" />`).
//   4. Nodes with children — open/close tags on separate lines.
//   5. Value formatting follows strict type rules.
// ---------------------------------------------------------------------------

import type { ComponentNode } from "./component-node"

/**
 * Serialize a `ComponentNode` into a JSX string suitable for MDX insertion.
 */
export function serializeComponentNode(node: ComponentNode): string {
  const propsStr = serializeProps(node.props)
  const tag = node.name

  // Self-closing: no children or hasChildren is false
  if (!node.hasChildren || node.children === undefined || node.children === "") {
    if (propsStr) {
      return `<${tag} ${propsStr} />`
    }
    return `<${tag} />`
  }

  // With children: open/close tags
  const open = propsStr ? `<${tag} ${propsStr}>` : `<${tag}>`
  return `${open}\n${node.children}\n</${tag}>`
}

// ---------------------------------------------------------------------------
// Prop serialization
// ---------------------------------------------------------------------------

/**
 * Serialize a props record into a JSX attribute string.
 *
 * - Lexicographic key ordering.
 * - Undefined / empty values are omitted.
 * - Stable escaping for strings.
 */
function serializeProps(props: Record<string, unknown>): string {
  const keys = Object.keys(props).sort()
  const parts: string[] = []

  for (const key of keys) {
    const value = props[key]
    if (value === undefined || value === "") continue
    const formatted = formatPropValue(value)
    if (formatted !== null) {
      parts.push(`${key}=${formatted}`)
    }
  }

  return parts.join(" ")
}

/**
 * Format a single prop value for JSX output.
 *
 * Type rules:
 * - `string`     → `"escaped value"`
 * - `number`     → `{123}`
 * - `boolean`    → `{true}` / `{false}`
 * - Expressions (strings starting with `{` or objects/arrays) → `{expr}`
 * - `null`       → skipped (returns null)
 */
function formatPropValue(value: unknown): string | null {
  if (value === null) return null

  if (typeof value === "boolean") {
    return `{${value}}`
  }

  if (typeof value === "number") {
    return `{${value}}`
  }

  if (typeof value === "string") {
    // Expression pass-through: if the string is wrapped in curlies, treat
    // it as a JSX expression. This supports `expression` and raw pass-through.
    if (value.startsWith("{") && value.endsWith("}")) {
      return value
    }
    return `"${escapeJsxString(value)}"`
  }

  // Arrays / objects → JSON expression
  if (typeof value === "object") {
    return `{${JSON.stringify(value)}}`
  }

  return null
}

/**
 * Escape special characters for a JSX string attribute value.
 */
function escapeJsxString(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")
}
