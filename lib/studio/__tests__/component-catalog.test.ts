import { describe, expect, it } from "vitest"
import { buildComponentCatalog, getComponentLabel } from "../component-catalog"
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
// buildComponentCatalog
// ---------------------------------------------------------------------------

describe("buildComponentCatalog", () => {
  it("returns an empty array for an empty registry", () => {
    expect(buildComponentCatalog({})).toEqual([])
  })

  it("returns entries sorted alphabetically by display label", () => {
    const registry: Record<string, RepoComponentDef> = {
      Callout: makeDef({ name: "Callout" }),
      Alert: makeDef({ name: "Alert" }),
      Zebra: makeDef({ name: "Zebra" }),
    }

    const catalog = buildComponentCatalog(registry)

    expect(catalog.map((e) => e.name)).toEqual(["Alert", "Callout", "Zebra"])
  })

  it("sorts by displayName when present (overriding name)", () => {
    const registry: Record<string, RepoComponentDef> = {
      ZComponent: makeDef({ name: "ZComponent", displayName: "Alpha Widget" }),
      AComponent: makeDef({ name: "AComponent", displayName: "Zeta Widget" }),
    }

    const catalog = buildComponentCatalog(registry)

    // "Alpha Widget" < "Zeta Widget"
    expect(catalog[0].name).toBe("ZComponent")
    expect(catalog[1].name).toBe("AComponent")
  })

  it("preserves all definition fields in catalog entries", () => {
    const def = makeDef({
      name: "DocsImage",
      version: 3,
      displayName: "Image",
      description: "An image component",
      props: [{ name: "src", type: "image" }],
      hasChildren: false,
      kind: "flow",
      source: "config",
      capabilities: { media: true, configurable: true },
    })

    const registry = { DocsImage: def }
    const catalog = buildComponentCatalog(registry)

    expect(catalog).toHaveLength(1)
    expect(catalog[0]).toEqual(def)
  })

  it("produces a stable sort for entries with the same label", () => {
    const registry: Record<string, RepoComponentDef> = {
      A: makeDef({ name: "A", displayName: "Same" }),
      B: makeDef({ name: "B", displayName: "Same" }),
    }

    const c1 = buildComponentCatalog(registry)
    const c2 = buildComponentCatalog(registry)

    expect(c1.map((e) => e.name)).toEqual(c2.map((e) => e.name))
  })
})

// ---------------------------------------------------------------------------
// getComponentLabel
// ---------------------------------------------------------------------------

describe("getComponentLabel", () => {
  it("returns displayName when present", () => {
    const def = makeDef({ name: "DocsImage", displayName: "Image" })
    expect(getComponentLabel(def)).toBe("Image")
  })

  it("falls back to name when displayName is absent", () => {
    const def = makeDef({ name: "DocsImage" })
    expect(getComponentLabel(def)).toBe("DocsImage")
  })
})
