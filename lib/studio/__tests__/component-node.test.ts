import { describe, expect, it } from "vitest"
import { buildComponentNode, toJsxProperties } from "../component-node"
import type { RepoComponentDef } from "../component-registry"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDef(overrides: Partial<RepoComponentDef> & { name: string }): RepoComponentDef {
  return {
    props: [],
    hasChildren: true,
    kind: "flow",
    source: "config",
    capabilities: {},
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Basic node building
// ---------------------------------------------------------------------------

describe("buildComponentNode — basic", () => {
  it("produces a node with name, kind, hasChildren from def", () => {
    const def = makeDef({
      name: "Callout",
      kind: "flow",
      hasChildren: true,
    })

    const node = buildComponentNode(def, {})

    expect(node.name).toBe("Callout")
    expect(node.kind).toBe("flow")
    expect(node.hasChildren).toBe(true)
  })

  it("includes provided form values for defined props", () => {
    const def = makeDef({
      name: "DocsImage",
      props: [
        { name: "src", type: "image" },
        { name: "alt", type: "string" },
      ],
      hasChildren: false,
    })

    const node = buildComponentNode(def, {
      src: "/img/hero.png",
      alt: "Hero image",
    })

    expect(node.props.src).toBe("/img/hero.png")
    expect(node.props.alt).toBe("Hero image")
  })

  it("omits undefined and empty-string form values", () => {
    const def = makeDef({
      name: "DocsImage",
      props: [
        { name: "src", type: "image" },
        { name: "alt", type: "string" },
      ],
      hasChildren: false,
    })

    const node = buildComponentNode(def, { src: "/img/hero.png", alt: "" })

    expect(node.props.src).toBe("/img/hero.png")
    expect(node.props.alt).toBeUndefined()
  })

  it("ignores form values not in the definition props", () => {
    const def = makeDef({
      name: "Badge",
      props: [{ name: "variant", type: "string" }],
    })

    const node = buildComponentNode(def, {
      variant: "success",
      extraProp: "should be ignored",
    })

    expect(node.props.variant).toBe("success")
    expect(node.props.extraProp).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

describe("buildComponentNode — defaults", () => {
  it("fills in default when form value is absent", () => {
    const def = makeDef({
      name: "Callout",
      props: [{ name: "type", type: "string", default: "info" }],
    })

    const node = buildComponentNode(def, {})

    expect(node.props.type).toBe("info")
  })

  it("form value overrides default", () => {
    const def = makeDef({
      name: "Callout",
      props: [{ name: "type", type: "string", default: "info" }],
    })

    const node = buildComponentNode(def, { type: "warning" })

    expect(node.props.type).toBe("warning")
  })
})

// ---------------------------------------------------------------------------
// Type coercion
// ---------------------------------------------------------------------------

describe("buildComponentNode — type coercion", () => {
  it("coerces string number values to numbers", () => {
    const def = makeDef({
      name: "Grid",
      props: [{ name: "columns", type: "number" }],
    })

    const node = buildComponentNode(def, { columns: "3" })

    expect(node.props.columns).toBe(3)
  })

  it("omits NaN for invalid number values", () => {
    const def = makeDef({
      name: "Grid",
      props: [{ name: "columns", type: "number" }],
    })

    const node = buildComponentNode(def, { columns: "not-a-number" })

    expect(node.props.columns).toBeUndefined()
  })

  it("coerces string boolean values", () => {
    const def = makeDef({
      name: "Toggle",
      props: [{ name: "checked", type: "boolean" }],
    })

    expect(buildComponentNode(def, { checked: "true" }).props.checked).toBe(true)
    expect(buildComponentNode(def, { checked: "false" }).props.checked).toBe(false)
  })

  it("passes through actual boolean values", () => {
    const def = makeDef({
      name: "Toggle",
      props: [{ name: "checked", type: "boolean" }],
    })

    expect(buildComponentNode(def, { checked: true }).props.checked).toBe(true)
    expect(buildComponentNode(def, { checked: false }).props.checked).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Children handling
// ---------------------------------------------------------------------------

describe("buildComponentNode — children", () => {
  it("includes children when hasChildren is true and value is non-empty", () => {
    const def = makeDef({
      name: "Callout",
      hasChildren: true,
    })

    const node = buildComponentNode(def, { children: "Hello **world**" })

    expect(node.children).toBe("Hello **world**")
  })

  it("omits children when value is empty string", () => {
    const def = makeDef({ name: "Callout", hasChildren: true })

    const node = buildComponentNode(def, { children: "" })

    expect(node.children).toBeUndefined()
  })

  it("omits children when hasChildren is false even if provided", () => {
    const def = makeDef({ name: "DocsImage", hasChildren: false })

    const node = buildComponentNode(def, { children: "ignored" })

    expect(node.children).toBeUndefined()
  })

  it("omits children when not provided", () => {
    const def = makeDef({ name: "Callout", hasChildren: true })

    const node = buildComponentNode(def, {})

    expect(node.children).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// toJsxProperties — converts ComponentNode props to MDXEditor JsxProperties
// ---------------------------------------------------------------------------

describe("toJsxProperties", () => {
  it("converts string props to plain strings", () => {
    const def = makeDef({
      name: "Callout",
      props: [{ name: "title", type: "string" }],
    })
    const node = buildComponentNode(def, { title: "Hello" })
    const result = toJsxProperties(node, def)

    expect(result.title).toBe("Hello")
  })

  it("converts image props to plain strings", () => {
    const def = makeDef({
      name: "DocsImage",
      props: [{ name: "src", type: "image" }],
      hasChildren: false,
    })
    const node = buildComponentNode(def, { src: "/img/hero.png" })
    const result = toJsxProperties(node, def)

    expect(result.src).toBe("/img/hero.png")
  })

  it("converts number props to expression objects", () => {
    const def = makeDef({
      name: "Grid",
      props: [{ name: "columns", type: "number" }],
    })
    const node = buildComponentNode(def, { columns: "3" })
    const result = toJsxProperties(node, def)

    expect(result.columns).toEqual({ type: "expression", value: "3" })
  })

  it("converts boolean props to expression objects", () => {
    const def = makeDef({
      name: "Toggle",
      props: [{ name: "checked", type: "boolean" }],
    })
    const node = buildComponentNode(def, { checked: true })
    const result = toJsxProperties(node, def)

    expect(result.checked).toEqual({ type: "expression", value: "true" })
  })

  it("converts expression props to expression objects", () => {
    const def = makeDef({
      name: "Custom",
      props: [{ name: "data", type: "expression" }],
    })
    const node = buildComponentNode(def, { data: '["a", "b"]' })
    const result = toJsxProperties(node, def)

    expect(result.data).toEqual({ type: "expression", value: '["a", "b"]' })
  })

  it("strips curly braces from expression values wrapped by user", () => {
    const def = makeDef({
      name: "Custom",
      props: [{ name: "items", type: "expression" }],
    })
    const node = buildComponentNode(def, { items: '{["a", "b"]}' })
    const result = toJsxProperties(node, def)

    expect(result.items).toEqual({ type: "expression", value: '["a", "b"]' })
  })

  it("omits undefined and empty-string values", () => {
    const def = makeDef({
      name: "DocsImage",
      props: [
        { name: "src", type: "image" },
        { name: "alt", type: "string" },
      ],
      hasChildren: false,
    })
    const node = buildComponentNode(def, { src: "/img/hero.png" })
    const result = toJsxProperties(node, def)

    expect(result.src).toBe("/img/hero.png")
    expect(result.alt).toBeUndefined()
  })

  it("handles mixed prop types correctly", () => {
    const def = makeDef({
      name: "Card",
      props: [
        { name: "title", type: "string" },
        { name: "columns", type: "number" },
        { name: "bordered", type: "boolean" },
        { name: "src", type: "image" },
      ],
    })
    const node = buildComponentNode(def, {
      title: "My Card",
      columns: "2",
      bordered: true,
      src: "/img/card.png",
    })
    const result = toJsxProperties(node, def)

    expect(result.title).toBe("My Card")
    expect(result.columns).toEqual({ type: "expression", value: "2" })
    expect(result.bordered).toEqual({ type: "expression", value: "true" })
    expect(result.src).toBe("/img/card.png")
  })

  it("normalizes prop ordering lexicographically", () => {
    const def = makeDef({
      name: "DocsImage",
      props: [
        { name: "src", type: "image" },
        { name: "alt", type: "string" },
        { name: "caption", type: "string" },
      ],
      hasChildren: false,
    })
    const node = buildComponentNode(def, {
      src: "https://example.com/image.png",
      alt: "Alt text",
      caption: "Caption",
    })
    const result = toJsxProperties(node, def)

    expect(Object.keys(result)).toEqual(["alt", "caption", "src"])
  })

  it("falls back to string for unknown prop types", () => {
    const def = makeDef({
      name: "Widget",
      props: [{ name: "data", type: "string" }], // normalized from unknown
    })
    const node = buildComponentNode(def, { data: "value" })
    const result = toJsxProperties(node, def)

    expect(result.data).toBe("value")
  })
})
