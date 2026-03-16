// ---------------------------------------------------------------------------
// ComponentNode — intermediate model between form state and serializer
// ---------------------------------------------------------------------------
//
// The node captures a fully-resolved snapshot of a component instance that
// is ready for serialization.  It is the **only** input the serializer accepts,
// ensuring a clean boundary between UI/form concerns and output generation.
// ---------------------------------------------------------------------------

import type { RepoComponentDef, RepoComponentPropDef } from "./component-registry"

/**
 * A resolved component instance ready for serialization.
 */
export type ComponentNode = {
  /** Component name (PascalCase). */
  name: string
  /** Block-level (`flow`) or inline (`text`). */
  kind: "flow" | "text"
  /** Resolved prop values keyed by prop name. */
  props: Record<string, unknown>
  /** Whether the component accepts children. */
  hasChildren: boolean
  /** Optional children content (plain text / MDX fragment). */
  children?: string
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a `ComponentNode` from a registry definition and raw form state.
 *
 * Rules:
 * 1. Only props defined in `def.props` are included.
 * 2. Undefined / empty-string values are omitted (serializer will skip them).
 * 3. Default values from the definition fill in when the form value is absent.
 * 4. `children` is only set when `def.hasChildren` is true and the value is
 *    a non-empty string.
 */
export function buildComponentNode(def: RepoComponentDef, formState: Record<string, unknown>): ComponentNode {
  const props: Record<string, unknown> = {}

  for (const propDef of def.props) {
    const value = resolveValue(propDef, formState[propDef.name])
    if (value !== undefined) {
      props[propDef.name] = value
    }
  }

  const node: ComponentNode = {
    name: def.name,
    kind: def.kind,
    props,
    hasChildren: def.hasChildren,
  }

  if (def.hasChildren) {
    const raw = formState.children
    if (typeof raw === "string" && raw.length > 0) {
      node.children = raw
    }
  }

  return node
}

// ---------------------------------------------------------------------------
// JsxProperties converter (for MDXEditor insertJsx$ API)
// ---------------------------------------------------------------------------

/**
 * MDXEditor's `insertJsx$` expects `JsxProperties = Record<string, string | ExpressionValue>`.
 * This converts a `ComponentNode`'s resolved props into that format using
 * the type information from the component definition.
 *
 * Mapping:
 * - `string` / `image` → plain string
 * - `number`           → `{ type: "expression", value: "123" }`
 * - `boolean`          → `{ type: "expression", value: "true" }`
 * - `expression`       → `{ type: "expression", value: "expr..." }`
 */
export function toJsxProperties(
  node: ComponentNode,
  def: RepoComponentDef,
): Record<string, string | { type: "expression"; value: string }> {
  const propTypes = new Map(def.props.map((p) => [p.name, p.type]))
  const result: Record<string, string | { type: "expression"; value: string }> = {}

  const sortedPropKeys = Object.keys(node.props).sort((a, b) => a.localeCompare(b))
  for (const key of sortedPropKeys) {
    const value = node.props[key]
    if (value === undefined) continue
    const type = propTypes.get(key) ?? "string"

    switch (type) {
      case "number":
        result[key] = { type: "expression", value: String(value) }
        break
      case "boolean":
        result[key] = { type: "expression", value: String(value) }
        break
      case "expression": {
        const strVal = String(value)
        // Strip curlies if user wrapped the expression in them
        if (strVal.startsWith("{") && strVal.endsWith("}")) {
          result[key] = { type: "expression", value: strVal.slice(1, -1) }
        } else {
          result[key] = { type: "expression", value: strVal }
        }
        break
      }
      default:
        result[key] = String(value)
        break
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveValue(propDef: RepoComponentPropDef, formValue: unknown): unknown {
  // Form provided a value → use it
  if (formValue !== undefined) {
    return coerce(propDef.type, formValue)
  }
  // Fall back to definition default
  if (propDef.default !== undefined) {
    return propDef.default
  }
  return undefined
}

function coerce(type: string, value: unknown): unknown {
  switch (type) {
    case "number": {
      const n = Number(value)
      return Number.isNaN(n) ? undefined : n
    }
    case "boolean": {
      if (typeof value === "boolean") return value
      if (value === "true") return true
      if (value === "false") return false
      return undefined
    }
    default:
      return value
  }
}
