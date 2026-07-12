import { describe, expect, it } from "vitest"
import { createRenderBindings, getRenderBindingNames } from "../../preview/render-bindings"
import { buildAuthoringCatalog } from "../authoring-catalog"

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
})
