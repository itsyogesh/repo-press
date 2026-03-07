import { describe, expect, it } from "vitest"
import { buildEditorInsertOperation } from "../component-insert-operation"
import { buildComponentNode } from "../component-node"
import type { RepoComponentDef } from "../component-registry"

function makeDef(overrides: Partial<RepoComponentDef> & { name: string }): RepoComponentDef {
  return {
    props: [],
    hasChildren: false,
    kind: "flow",
    source: "config",
    ...overrides,
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
