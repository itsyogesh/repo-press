import { describe, expect, it } from "vitest"
import { createRenderBindings, getRenderBindingNames } from "../../preview/render-bindings"
import { AUTHORING_CATALOG_LIMITS, buildAuthoringCatalog } from "../authoring-catalog"

describe("authoring catalog separation", () => {
  it("keeps executable render bindings outside the serializable catalog", () => {
    const Callout = () => null
    const bindings = createRenderBindings({ Callout })

    const catalog = buildAuthoringCatalog({ nativeComponentNames: getRenderBindingNames(bindings) })

    expect(bindings.Callout).toBe(Callout)
    expect(catalog).toHaveLength(1)
    expect(JSON.parse(JSON.stringify(catalog))).toStrictEqual(catalog)
    expect(JSON.stringify(catalog)).not.toContain("() => null")
  })

  it("marks native components without metadata incomplete without framework schema guessing", () => {
    const catalog = buildAuthoringCatalog({
      nativeComponentNames: ["Callout", "DocsImage"],
      framework: "fumadocs",
    })

    expect(catalog).toEqual([
      expect.objectContaining({ mdxName: "Callout", schemaStatus: "incomplete", props: [], slots: [] }),
      expect.objectContaining({ mdxName: "DocsImage", schemaStatus: "incomplete", props: [], slots: [] }),
    ])
  })

  it("uses config as metadata only and ignores executable implementation claims", () => {
    const implementation = () => "must remain repository-owned"
    const catalog = buildAuthoringCatalog({
      metadata: {
        Callout: {
          props: [{ name: "tone", type: "string" }],
          hasChildren: true,
          implementation,
        } as never,
      },
    })

    expect(catalog[0]).toEqual(
      expect.objectContaining({
        mdxName: "Callout",
        schemaStatus: "complete",
        provenance: { source: "manual" },
      }),
    )
    expect(catalog[0]).not.toHaveProperty("implementation")
    expect(JSON.stringify(catalog)).not.toContain("repository-owned")
  })

  it("does not let one configured component hide other discovered native names", () => {
    const catalog = buildAuthoringCatalog({
      nativeComponentNames: ["Callout", "Steps", "Tabs"],
      metadata: {
        Callout: {
          displayName: "Notice",
          props: [{ name: "tone", type: "string" }],
          hasChildren: true,
        },
      },
    })

    expect(catalog.map((entry) => entry.mdxName).sort()).toEqual(["Callout", "Steps", "Tabs"])
    expect(catalog.find((entry) => entry.mdxName === "Callout")?.schemaStatus).toBe("complete")
    expect(catalog.find((entry) => entry.mdxName === "Steps")?.schemaStatus).toBe("incomplete")
  })

  it("rejects non-serializable values in recognized metadata fields", () => {
    expect(() =>
      buildAuthoringCatalog({
        metadata: {
          Widget: {
            props: [{ name: "value", type: "string", default: () => "unsafe" }],
          },
        },
      }),
    ).toThrow("serializable")
  })

  it("removes explicit undefined optionals so JSON round trips exactly", () => {
    const catalog = buildAuthoringCatalog({
      metadata: {
        Widget: {
          slots: [{ name: "children", accepts: "mdx", required: undefined }],
          provenance: { source: "registry", version: undefined },
        },
      },
    })

    expect(JSON.parse(JSON.stringify(catalog))).toStrictEqual(catalog)
  })

  it.each([
    "string",
    "number",
    "boolean",
    "expression",
    "image",
  ] as const)("preserves the supported %s prop type", (type) => {
    const [component] = buildAuthoringCatalog({
      metadata: { Widget: { props: [{ name: "value", type }] } },
    })
    expect(component.props[0].type).toBe(type)
  })

  it("normalizes unknown prop types conservatively to string", () => {
    const [component] = buildAuthoringCatalog({
      metadata: { Widget: { props: [{ name: "value", type: "class-instance" }] } },
    })
    expect(component.props[0].type).toBe("string")
  })

  it.each(["client", "server", "astro"] as const)("preserves explicit %s runtime metadata", (runtime) => {
    const [component] = buildAuthoringCatalog({ metadata: { Widget: { runtime } } })
    expect(component.runtime).toBe(runtime)
  })

  it.each(["native", "registry", "manual"] as const)("preserves %s provenance metadata", (source) => {
    const [component] = buildAuthoringCatalog({ metadata: { Widget: { provenance: { source } } } })
    expect(component.provenance.source).toBe(source)
  })

  it.each(["text", "markdown", "mdx", "components"] as const)("preserves %s slot acceptance", (accepts) => {
    const [component] = buildAuthoringCatalog({
      metadata: { Widget: { slots: [{ name: "children", accepts, required: true }] } },
    })
    expect(component.slots).toEqual([{ name: "children", accepts, required: true }])
  })

  it("preserves all supported optional prop metadata", () => {
    const [component] = buildAuthoringCatalog({
      metadata: {
        Widget: {
          props: [
            {
              name: "tone",
              type: "string",
              label: "Tone",
              default: "info",
              required: true,
              description: "Visual tone",
              options: ["info", "warning"],
              placeholder: "Choose a tone",
            },
          ],
        },
      },
    })
    expect(component.props[0]).toStrictEqual({
      name: "tone",
      type: "string",
      label: "Tone",
      default: "info",
      required: true,
      description: "Visual tone",
      options: ["info", "warning"],
      placeholder: "Choose a tone",
    })
  })

  it("preserves catalog display, category, fixtures, and logical identity metadata", () => {
    const [component] = buildAuthoringCatalog({
      metadata: {
        Callout: {
          logicalId: "registry:callout",
          displayName: "Notice",
          description: "Highlighted content",
          category: "Content",
          previewFixtures: ["info", "warning"],
        },
      },
    })
    expect(component).toEqual(
      expect.objectContaining({
        logicalId: "registry:callout",
        mdxName: "Callout",
        displayName: "Notice",
        description: "Highlighted content",
        category: "Content",
        previewFixtures: ["info", "warning"],
      }),
    )
  })

  it("converts legacy children metadata without guessing other slots", () => {
    const [component] = buildAuthoringCatalog({ metadata: { Panel: { hasChildren: true } } })
    expect(component.slots).toEqual([{ name: "children", accepts: "mdx" }])
  })

  it("does not add a children slot when legacy metadata disables children", () => {
    const [component] = buildAuthoringCatalog({ metadata: { Image: { hasChildren: false } } })
    expect(component.slots).toEqual([])
  })

  it("deduplicates native and metadata names", () => {
    const catalog = buildAuthoringCatalog({ nativeComponentNames: ["Callout", "Callout"], metadata: { Callout: {} } })
    expect(catalog).toHaveLength(1)
  })

  it("is deterministic across native name ordering", () => {
    const first = buildAuthoringCatalog({ nativeComponentNames: ["Zebra", "Alpha"] })
    const second = buildAuthoringCatalog({ nativeComponentNames: ["Alpha", "Zebra"] })
    expect(first).toStrictEqual(second)
  })

  it.each([
    ["symbol", Symbol("unsafe")],
    ["bigint", BigInt(1)],
    ["date", new Date("2026-01-01")],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
  ])("rejects a non-JSON %s default", (_label, value) => {
    expect(() =>
      buildAuthoringCatalog({ metadata: { Widget: { props: [{ name: "value", type: "string", default: value }] } } }),
    ).toThrow("serializable")
  })

  it("keeps display-only metadata incomplete", () => {
    const [component] = buildAuthoringCatalog({ metadata: { Callout: { displayName: "Notice" } } })
    expect(component.schemaStatus).toBe("incomplete")
  })

  it("keeps empty metadata incomplete", () => {
    const [component] = buildAuthoringCatalog({ metadata: { Callout: {} } })
    expect(component.schemaStatus).toBe("incomplete")
  })

  it("marks an explicit prop and slot contract complete", () => {
    const [component] = buildAuthoringCatalog({ metadata: { Callout: { props: [], hasChildren: false } } })
    expect(component.schemaStatus).toBe("complete")
  })

  it("does not let an unbacked complete claim fabricate schema completeness", () => {
    const [component] = buildAuthoringCatalog({
      metadata: { Callout: { schemaStatus: "complete", displayName: "Notice" } },
    })
    expect(component.schemaStatus).toBe("incomplete")
  })

  it.each([
    "__proto__",
    "prototype",
    "constructor",
    "toString",
    "not valid",
    "Callout..Title",
  ])("rejects unsafe MDX name %s", (mdxName) => {
    expect(() => buildAuthoringCatalog({ nativeComponentNames: [mdxName] })).toThrow("MDX name")
  })

  it("accepts a safe dotted MDX member reference", () => {
    expect(buildAuthoringCatalog({ nativeComponentNames: ["Tabs.Item"] })[0].mdxName).toBe("Tabs.Item")
  })

  it.each(["__proto__", "constructor", "toString", "bad name"])("rejects unsafe logical ID %s", (logicalId) => {
    expect(() => buildAuthoringCatalog({ metadata: { Callout: { logicalId } } })).toThrow("logical ID")
  })

  it.each(["__proto__", "constructor", "toString", "bad name"])("rejects unsafe prop name %s", (name) => {
    expect(() =>
      buildAuthoringCatalog({ metadata: { Callout: { props: [{ name, type: "string" }], hasChildren: false } } }),
    ).toThrow("prop name")
  })

  it("rejects duplicate prop names", () => {
    expect(() =>
      buildAuthoringCatalog({
        metadata: {
          Callout: {
            props: [
              { name: "tone", type: "string" },
              { name: "tone", type: "string" },
            ],
            hasChildren: false,
          },
        },
      }),
    ).toThrow("duplicate prop")
  })

  it("rejects duplicate slot names", () => {
    expect(() =>
      buildAuthoringCatalog({
        metadata: {
          Tabs: {
            props: [],
            slots: [
              { name: "children", accepts: "mdx" },
              { name: "children", accepts: "components" },
            ],
          },
        },
      }),
    ).toThrow("duplicate slot")
  })

  it("rejects duplicate logical IDs across different MDX names", () => {
    expect(() =>
      buildAuthoringCatalog({
        metadata: {
          Callout: { logicalId: "shared", props: [], hasChildren: false },
          Notice: { logicalId: "shared", props: [], hasChildren: false },
        },
      }),
    ).toThrow("duplicate logical ID")
  })

  it("rejects nested undefined values", () => {
    expect(() =>
      buildAuthoringCatalog({
        metadata: { Widget: { props: [{ name: "value", type: "string", default: { nested: undefined } }] } },
      }),
    ).toThrow("undefined")
  })

  it("rejects sparse arrays that would change during JSON serialization", () => {
    const sparse = Array(2)
    sparse[1] = "value"
    expect(() =>
      buildAuthoringCatalog({
        metadata: { Widget: { props: [{ name: "value", type: "expression", default: sparse }] } },
      }),
    ).toThrow("undefined")
  })

  it("rejects an invalid explicit schema status", () => {
    expect(() =>
      buildAuthoringCatalog({
        metadata: { Widget: { schemaStatus: "trusted-ish", props: [], hasChildren: false } as never },
      }),
    ).toThrow("schema status")
  })

  it("rejects cyclic defaults without overflowing", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() =>
      buildAuthoringCatalog({
        metadata: { Widget: { props: [{ name: "value", type: "string", default: cyclic }] } },
      }),
    ).toThrow("cycle")
  })

  it("rejects defaults beyond the depth limit", () => {
    let value: Record<string, unknown> = {}
    for (let index = 0; index <= AUTHORING_CATALOG_LIMITS.maxDepth; index += 1) value = { nested: value }
    expect(() =>
      buildAuthoringCatalog({ metadata: { Widget: { props: [{ name: "value", type: "string", default: value }] } } }),
    ).toThrow("depth")
  })

  it("rejects defaults beyond the node limit", () => {
    const value = Array.from({ length: AUTHORING_CATALOG_LIMITS.maxNodes + 1 }, () => null)
    expect(() =>
      buildAuthoringCatalog({ metadata: { Widget: { props: [{ name: "value", type: "string", default: value }] } } }),
    ).toThrow("node")
  })

  it("rejects catalog strings beyond the UTF-8 byte limit", () => {
    const displayName = "é".repeat(AUTHORING_CATALOG_LIMITS.maxUtf8Bytes)
    expect(() => buildAuthoringCatalog({ metadata: { Widget: { displayName } } })).toThrow("byte")
  })

  it("deep clones and freezes recognized metadata", () => {
    const defaultValue = { nested: ["before"] }
    const metadata = {
      Widget: { props: [{ name: "value", type: "expression", default: defaultValue }], hasChildren: false },
    }
    const catalog = buildAuthoringCatalog({ metadata })
    defaultValue.nested[0] = "after"

    expect(catalog[0].props[0].default).toStrictEqual({ nested: ["before"] })
    expect(Object.isFrozen(catalog)).toBe(true)
    expect(Object.isFrozen(catalog[0].props[0].default)).toBe(true)
    expect(JSON.parse(JSON.stringify(catalog))).toStrictEqual(catalog)
  })
})
