import { describe, expect, it } from "vitest"
import type { ComponentNode } from "../component-node"
import { serializeComponentNode } from "../component-serializer"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<ComponentNode> & { name: string }): ComponentNode {
  return {
    kind: "flow",
    props: {},
    hasChildren: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Self-closing (no children)
// ---------------------------------------------------------------------------

describe("serializeComponentNode — self-closing", () => {
  it("produces single-line self-closing JSX with no props", () => {
    const node = makeNode({ name: "Divider" })
    expect(serializeComponentNode(node)).toBe("<Divider />")
  })

  it("produces single-line self-closing JSX with props", () => {
    const node = makeNode({
      name: "DocsImage",
      props: { alt: "Hero", src: "/img/hero.png" },
    })

    const result = serializeComponentNode(node)

    expect(result).toBe('<DocsImage alt="Hero" src="/img/hero.png" />')
    // Verify single-line
    expect(result.split("\n")).toHaveLength(1)
  })

  it("produces single-line even with many props", () => {
    const node = makeNode({
      name: "Widget",
      props: { a: "1", b: "2", c: "3", d: "4", e: "5" },
    })

    const result = serializeComponentNode(node)
    expect(result.split("\n")).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// With children (open/close tags)
// ---------------------------------------------------------------------------

describe("serializeComponentNode — with children", () => {
  it("produces open/close tags with children content", () => {
    const node = makeNode({
      name: "Callout",
      hasChildren: true,
      props: { type: "warning" },
      children: "Be careful!",
    })

    const result = serializeComponentNode(node)

    expect(result).toBe('<Callout type="warning">\nBe careful!\n</Callout>')
  })

  it("produces self-closing when hasChildren is true but children is empty", () => {
    const node = makeNode({
      name: "Callout",
      hasChildren: true,
      props: {},
      children: "",
    })

    expect(serializeComponentNode(node)).toBe("<Callout />")
  })

  it("produces self-closing when hasChildren is true but children is undefined", () => {
    const node = makeNode({
      name: "Callout",
      hasChildren: true,
      props: {},
    })

    expect(serializeComponentNode(node)).toBe("<Callout />")
  })

  it("handles multiline children", () => {
    const node = makeNode({
      name: "Card",
      hasChildren: true,
      props: { title: "My Card" },
      children: "Line 1\nLine 2\nLine 3",
    })

    const result = serializeComponentNode(node)

    expect(result).toBe('<Card title="My Card">\nLine 1\nLine 2\nLine 3\n</Card>')
  })
})

// ---------------------------------------------------------------------------
// Prop ordering (lexicographic)
// ---------------------------------------------------------------------------

describe("serializeComponentNode — prop ordering", () => {
  it("orders props lexicographically", () => {
    const node = makeNode({
      name: "Widget",
      props: { zebra: "z", alpha: "a", middle: "m" },
    })

    const result = serializeComponentNode(node)

    expect(result).toBe('<Widget alpha="a" middle="m" zebra="z" />')
  })

  it("is deterministic for the same props in different insertion order", () => {
    const props1 = { c: "3", a: "1", b: "2" }
    const props2 = { a: "1", b: "2", c: "3" }

    const r1 = serializeComponentNode(makeNode({ name: "X", props: props1 }))
    const r2 = serializeComponentNode(makeNode({ name: "X", props: props2 }))

    expect(r1).toBe(r2)
  })
})

// ---------------------------------------------------------------------------
// Value formatting by type
// ---------------------------------------------------------------------------

describe("serializeComponentNode — value formatting", () => {
  it("formats string values with double quotes", () => {
    const node = makeNode({
      name: "Tag",
      props: { label: "hello" },
    })

    expect(serializeComponentNode(node)).toBe('<Tag label="hello" />')
  })

  it("formats number values with curly braces", () => {
    const node = makeNode({
      name: "Grid",
      props: { columns: 3 },
    })

    expect(serializeComponentNode(node)).toBe("<Grid columns={3} />")
  })

  it("formats boolean true with curly braces", () => {
    const node = makeNode({
      name: "Toggle",
      props: { checked: true },
    })

    expect(serializeComponentNode(node)).toBe("<Toggle checked={true} />")
  })

  it("formats boolean false with curly braces", () => {
    const node = makeNode({
      name: "Toggle",
      props: { checked: false },
    })

    expect(serializeComponentNode(node)).toBe("<Toggle checked={false} />")
  })

  it("passes through expression strings wrapped in curlies", () => {
    const node = makeNode({
      name: "Tabs",
      props: { items: '{["Tab 1", "Tab 2"]}' },
    })

    expect(serializeComponentNode(node)).toBe('<Tabs items={["Tab 1", "Tab 2"]} />')
  })

  it("formats object values as JSON expressions", () => {
    const node = makeNode({
      name: "Config",
      props: { data: { key: "value" } },
    })

    expect(serializeComponentNode(node)).toBe('<Config data={{"key":"value"}} />')
  })

  it("formats array values as JSON expressions", () => {
    const node = makeNode({
      name: "List",
      props: { items: [1, 2, 3] },
    })

    expect(serializeComponentNode(node)).toBe("<List items={[1,2,3]} />")
  })
})

// ---------------------------------------------------------------------------
// Omission of empty/undefined values
// ---------------------------------------------------------------------------

describe("serializeComponentNode — omission", () => {
  it("omits undefined prop values", () => {
    const node = makeNode({
      name: "Widget",
      props: { a: "keep", b: undefined },
    })

    expect(serializeComponentNode(node)).toBe('<Widget a="keep" />')
  })

  it("allows empty string prop values", () => {
    const node = makeNode({
      name: "Widget",
      props: { a: "keep", b: "" },
    })

    expect(serializeComponentNode(node)).toBe('<Widget a="keep" b="" />')
  })

  it("omits null prop values", () => {
    const node = makeNode({
      name: "Widget",
      props: { a: "keep", b: null },
    })

    expect(serializeComponentNode(node)).toBe('<Widget a="keep" />')
  })
})

// ---------------------------------------------------------------------------
// String escaping
// ---------------------------------------------------------------------------

describe("serializeComponentNode — escaping", () => {
  it("escapes double quotes in string values", () => {
    const node = makeNode({
      name: "Tag",
      props: { label: 'say "hello"' },
    })

    expect(serializeComponentNode(node)).toBe('<Tag label={"say \\"hello\\""} />')
  })

  it("escapes backslashes in string values", () => {
    const node = makeNode({
      name: "Tag",
      props: { path: "C:\\Users\\file" },
    })

    expect(serializeComponentNode(node)).toBe('<Tag path={"C:\\\\Users\\\\file"} />')
  })

  it("escapes newlines in string values", () => {
    const node = makeNode({
      name: "Tag",
      props: { text: "line1\nline2" },
    })

    expect(serializeComponentNode(node)).toBe('<Tag text={"line1\\nline2"} />')
  })
})

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("serializeComponentNode — determinism", () => {
  it("produces identical output across repeated calls", () => {
    const node = makeNode({
      name: "Complex",
      hasChildren: true,
      props: { z: 1, a: "hello", m: true },
      children: "Some content",
    })

    const results = Array.from({ length: 10 }, () => serializeComponentNode(node))

    const unique = new Set(results)
    expect(unique.size).toBe(1)
  })
})
