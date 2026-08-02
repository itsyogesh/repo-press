import type { BlockContent, DefinitionContent, PhrasingContent } from "mdast"
import type { AuthoringComponent } from "./authoring-catalog"
import type { ComponentNode } from "./component-node"
import { toJsxProperties } from "./component-node"
import { editComponentProp, findEditableMdxComponents } from "./mdx-source-edit"

type JsxProperties = Record<string, string | { type: "expression"; value: string }>
type JsxInsertPayload =
  | {
      kind: "flow"
      name: string
      props: JsxProperties
      children?: Array<BlockContent | DefinitionContent>
    }
  | {
      kind: "text"
      name: string
      props: JsxProperties
      children?: PhrasingContent[]
    }

export type EditorInsertOperation = {
  mode: "jsx"
  payload: JsxInsertPayload
}

export type EditorSourceEditOperation =
  | { mode: "source-edit"; source: string }
  | { mode: "source-edit-refused"; source: string; code: "UNSAFE_TO_PRESERVE" }

/** Select one parsed occurrence and apply a position-bound source edit. */
export function buildEditorSourceEditOperation(
  source: string,
  name: string,
  occurrence: number,
  changes: Record<string, unknown>,
): EditorSourceEditOperation {
  const discovered = findEditableMdxComponents(source)
  if (!discovered.ok) return { mode: "source-edit-refused", source, code: discovered.code }
  const target = discovered.targets.filter((candidate) => candidate.name === name)[occurrence]
  if (!target) return { mode: "source-edit-refused", source, code: "UNSAFE_TO_PRESERVE" }
  const result = editComponentProp(source, target, changes)
  return result.ok
    ? { mode: "source-edit", source: result.source }
    : { mode: "source-edit-refused", source, code: result.code }
}

/**
 * Convert a ComponentNode into an MDXEditor insertJsx payload.
 * Children are encoded as mdast nodes so insertion works in rich-text mode.
 */
export function buildEditorInsertOperation(def: AuthoringComponent, node: ComponentNode): EditorInsertOperation {
  const props = toJsxProperties(node, def)
  if (def.kind === "text") {
    const payload: JsxInsertPayload = {
      kind: "text",
      name: def.mdxName,
      props,
    }
    if (node.hasChildren && typeof node.children === "string" && node.children.length > 0) {
      payload.children = [{ type: "text", value: node.children }]
    }
    return { mode: "jsx", payload }
  }

  const payload: JsxInsertPayload = {
    kind: "flow",
    name: def.mdxName,
    props,
  }
  if (node.hasChildren && typeof node.children === "string" && node.children.length > 0) {
    payload.children = [{ type: "paragraph", children: [{ type: "text", value: node.children }] }]
  }
  return { mode: "jsx", payload }
}
