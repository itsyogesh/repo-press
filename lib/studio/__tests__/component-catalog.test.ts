import { describe, expect, it } from "vitest"
import type { AuthoringComponent } from "../authoring-catalog"
import {
  ALL_CATEGORIES,
  buildComponentCatalog,
  deriveCategory,
  getComponentLabel,
  groupByCategory,
} from "../component-catalog"

function makeComponent(mdxName: string, overrides: Partial<AuthoringComponent> = {}): AuthoringComponent {
  return {
    logicalId: mdxName,
    mdxName,
    displayName: mdxName,
    runtime: "client",
    schemaStatus: "complete",
    props: [],
    slots: [],
    previewFixtures: [],
    provenance: { source: "manual" },
    kind: "flow",
    ...overrides,
  }
}

describe("buildComponentCatalog", () => {
  it("returns an empty array for empty array and record inputs", () => {
    expect(buildComponentCatalog([])).toEqual([])
    expect(buildComponentCatalog({})).toEqual([])
  })

  it("sorts serializable entries by display label", () => {
    const catalog = buildComponentCatalog([
      makeComponent("Zed"),
      makeComponent("Alpha"),
      makeComponent("Middle", { displayName: "Beta" }),
    ])
    expect(catalog.map((entry) => entry.mdxName)).toEqual(["Alpha", "Middle", "Zed"])
  })

  it("does not filter native entries when project metadata exists", () => {
    const entries = [
      makeComponent("Configured", { provenance: { source: "manual" } }),
      makeComponent("Native", { provenance: { source: "native" }, schemaStatus: "incomplete" }),
    ]
    expect(buildComponentCatalog(entries, { hasProjectComponents: true }).map((entry) => entry.mdxName)).toEqual([
      "Configured",
      "Native",
    ])
  })

  it("uses the required display name", () => {
    expect(getComponentLabel(makeComponent("Callout", { displayName: "Notice" }))).toBe("Notice")
  })

  it("accepts the deprecated record projection without changing entries", () => {
    const native = makeComponent("Native", { schemaStatus: "incomplete" })
    expect(buildComponentCatalog({ Native: native })).toEqual([native])
  })

  it("uses mdxName as a deterministic tie-breaker", () => {
    const catalog = buildComponentCatalog([
      makeComponent("B", { displayName: "Same" }),
      makeComponent("A", { displayName: "Same" }),
    ])
    expect(catalog.map((entry) => entry.mdxName)).toEqual(["A", "B"])
  })

  it("does not mutate the source array while sorting", () => {
    const source = [makeComponent("B"), makeComponent("A")]
    buildComponentCatalog(source)
    expect(source.map((entry) => entry.mdxName)).toEqual(["B", "A"])
  })
})

describe("catalog categories", () => {
  it("derives media, content, layout, and custom from metadata", () => {
    expect(deriveCategory(makeComponent("Image", { props: [{ name: "src", type: "image" }] }))).toBe("Media")
    expect(deriveCategory(makeComponent("Badge", { kind: "text" }))).toBe("Content")
    expect(deriveCategory(makeComponent("Tabs", { slots: [{ name: "children", accepts: "components" }] }))).toBe(
      "Layout",
    )
    expect(deriveCategory(makeComponent("Counter"))).toBe("Custom")
  })

  it("honors an explicit supported category and groups entries", () => {
    const entries = [makeComponent("A", { category: "Content" }), makeComponent("B", { category: "Content" })]
    expect(groupByCategory(entries).get("Content")).toHaveLength(2)
    expect(ALL_CATEGORIES).toEqual(["Media", "Layout", "Content", "Custom"])
  })

  it("ignores unsupported explicit categories", () => {
    expect(deriveCategory(makeComponent("Widget", { category: "Unknown" }))).toBe("Custom")
  })

  it("gives media props priority over text and children placement", () => {
    expect(
      deriveCategory(
        makeComponent("InlineImage", {
          kind: "text",
          props: [{ name: "src", type: "image" }],
          slots: [{ name: "children", accepts: "text" }],
        }),
      ),
    ).toBe("Media")
  })

  it("returns an empty grouping for an empty catalog", () => {
    expect(groupByCategory([]).size).toBe(0)
  })

  it("keeps categories in their declared UI order", () => {
    expect(ALL_CATEGORIES.indexOf("Media")).toBeLessThan(ALL_CATEGORIES.indexOf("Custom"))
  })
})
