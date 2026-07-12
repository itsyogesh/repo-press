import { describe, expect, it } from "vitest"
import type { AuthoringComponent } from "../authoring-catalog"
import { buildEditorInsertOperation, buildEditorSourceEditOperation } from "../component-insert-operation"
import { buildComponentNode } from "../component-node"

function makeDef(overrides: Partial<AuthoringComponent> & { name: string; hasChildren?: boolean }): AuthoringComponent {
  const { name, hasChildren = false, ...metadata } = overrides
  return {
    logicalId: name,
    mdxName: name,
    displayName: name,
    exportName: name,
    frameworks: [],
    runtime: "client",
    schemaStatus: "complete",
    props: [],
    slots: hasChildren ? [{ name: "children", accepts: "mdx" }] : [],
    assets: [],
    previewFixtures: [],
    provenance: { source: "manual" },
    kind: "flow",
    ...metadata,
  }
}

describe("buildEditorInsertOperation", () => {
  it("uses jsx insertion with mdast children for components with children content", () => {
    const def = makeDef({
      name: "Callout",
      hasChildren: true,
      props: [{ name: "type", type: "string", default: "info" }],
    })

    const node = buildComponentNode(def, {
      type: "warning",
      children: "Read this first",
    })

    const operation = buildEditorInsertOperation(def, node)

    expect(operation).toEqual({
      mode: "jsx",
      payload: {
        kind: "flow",
        name: "Callout",
        props: {
          type: "warning",
        },
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", value: "Read this first" }],
          },
        ],
      },
    })
  })

  it("uses jsx insertion when component is self-closing", () => {
    const def = makeDef({
      name: "DocsImage",
      hasChildren: false,
      props: [
        { name: "src", type: "image" },
        { name: "alt", type: "string" },
      ],
    })

    const node = buildComponentNode(def, {
      src: "https://cdn.example.com/hero.png",
      alt: "Hero",
    })

    const operation = buildEditorInsertOperation(def, node)

    expect(operation).toEqual({
      mode: "jsx",
      payload: {
        kind: "flow",
        name: "DocsImage",
        props: {
          alt: "Hero",
          src: "https://cdn.example.com/hero.png",
        },
      },
    })
  })

  it("uses text children for inline components", () => {
    const def = makeDef({
      name: "Badge",
      kind: "text",
      hasChildren: true,
    })

    const node = buildComponentNode(def, {
      children: "Inline badge",
    })

    const operation = buildEditorInsertOperation(def, node)

    expect(operation).toEqual({
      mode: "jsx",
      payload: {
        kind: "text",
        name: "Badge",
        props: {},
        children: [{ type: "text", value: "Inline badge" }],
      },
    })
  })
})

describe("buildEditorSourceEditOperation", () => {
  it("keeps source edits separate from full-document AST serialization", () => {
    const source = '<Callout title="Before" />'
    const operation = buildEditorSourceEditOperation(source, "Callout", 0, { title: "After" })

    expect(operation).toEqual({ mode: "source-edit", source: '<Callout title="After" />' })
  })

  it("returns the fail-closed result when a source target cannot be selected", () => {
    const source = "<Callout {...props} />"
    expect(buildEditorSourceEditOperation(source, "Callout", 0, { title: "After" })).toEqual({
      mode: "source-edit-refused",
      source,
      code: "UNSAFE_TO_PRESERVE",
    })
  })
})
