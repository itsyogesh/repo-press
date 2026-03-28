import { describe, expect, it } from "vitest"
import {
  ALL_CATEGORIES,
  buildComponentCatalog,
  deriveCategory,
  getComponentLabel,
  groupByCategory,
} from "../component-catalog"
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

// ---------------------------------------------------------------------------
// deriveCategory
// ---------------------------------------------------------------------------

describe("deriveCategory", () => {
  it("returns Media for components with media capability", () => {
    const def = makeDef({ name: "DocsImage", props: [{ name: "src", type: "image" }], capabilities: { media: true } })
    expect(deriveCategory(def)).toBe("Media")
  })

  it("returns Content for text-kind components", () => {
    const def = makeDef({ name: "Badge", kind: "text", capabilities: { inline: true } })
    expect(deriveCategory(def)).toBe("Content")
  })

  it("returns Layout for components with children and no media", () => {
    const def = makeDef({ name: "Card", hasChildren: true })
    expect(deriveCategory(def)).toBe("Layout")
  })

  it("returns Custom for flow components without media or children", () => {
    const def = makeDef({ name: "Counter", hasChildren: false, props: [{ name: "start", type: "number" }] })
    expect(deriveCategory(def)).toBe("Custom")
  })

  it("Media takes priority over Layout when component has both media and children", () => {
    const def = makeDef({ name: "MediaCard", hasChildren: true, capabilities: { media: true } })
    expect(deriveCategory(def)).toBe("Media")
  })
})

// ---------------------------------------------------------------------------
// groupByCategory
// ---------------------------------------------------------------------------

describe("groupByCategory", () => {
  it("groups catalog entries by derived category", () => {
    const entries = [
      makeDef({ name: "DocsImage", capabilities: { media: true } }),
      makeDef({ name: "Card", hasChildren: true }),
      makeDef({ name: "Badge", kind: "text", capabilities: { inline: true } }),
      makeDef({ name: "Counter", hasChildren: false }),
    ]
    const groups = groupByCategory(entries)
    expect(groups.get("Media")).toHaveLength(1)
    expect(groups.get("Layout")).toHaveLength(1)
    expect(groups.get("Content")).toHaveLength(1)
    expect(groups.get("Custom")).toHaveLength(1)
  })

  it("returns empty map for empty catalog", () => {
    const groups = groupByCategory([])
    expect(groups.size).toBe(0)
  })

  it("groups multiple components in same category", () => {
    const entries = [
      makeDef({ name: "DocsImage", capabilities: { media: true } }),
      makeDef({ name: "DocsVideo", capabilities: { media: true } }),
    ]
    const groups = groupByCategory(entries)
    expect(groups.get("Media")).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// buildComponentCatalog — hasProjectComponents filtering
// ---------------------------------------------------------------------------

describe("buildComponentCatalog – hasProjectComponents filtering", () => {
  const registry: Record<string, RepoComponentDef> = {
    ConfigOnly: makeDef({ name: "ConfigOnly", source: "config" }),
    AdapterOnly: makeDef({ name: "AdapterOnly", source: "adapter" }),
    Merged: makeDef({ name: "Merged", source: "merged" }),
  }

  it("includes all sources when hasProjectComponents is false (default)", () => {
    const catalog = buildComponentCatalog(registry)
    expect(catalog.map((e) => e.name).sort()).toEqual(["AdapterOnly", "ConfigOnly", "Merged"])
  })

  it("includes all sources when hasProjectComponents is explicitly false", () => {
    const catalog = buildComponentCatalog(registry, { hasProjectComponents: false })
    expect(catalog.map((e) => e.name).sort()).toEqual(["AdapterOnly", "ConfigOnly", "Merged"])
  })

  it("excludes adapter-only components when hasProjectComponents is true", () => {
    const catalog = buildComponentCatalog(registry, { hasProjectComponents: true })
    const names = catalog.map((e) => e.name)
    expect(names).not.toContain("AdapterOnly")
    expect(names).toContain("ConfigOnly")
    expect(names).toContain("Merged")
  })

  it("returns empty array when registry has only adapter components and hasProjectComponents is true", () => {
    const adapterOnlyRegistry: Record<string, RepoComponentDef> = {
      Image: makeDef({ name: "Image", source: "adapter" }),
      Video: makeDef({ name: "Video", source: "adapter" }),
    }
    const catalog = buildComponentCatalog(adapterOnlyRegistry, { hasProjectComponents: true })
    expect(catalog).toHaveLength(0)
  })

  it("result is still sorted alphabetically by display label after filtering", () => {
    // Use entries where displayName order differs from name order
    const registryWithDisplayNames: Record<string, RepoComponentDef> = {
      ZConfig: makeDef({ name: "ZConfig", source: "config", displayName: "Alpha Block" }),
      AMerged: makeDef({ name: "AMerged", source: "merged", displayName: "Zeta Block" }),
    }
    const catalog = buildComponentCatalog(registryWithDisplayNames, { hasProjectComponents: true })
    // "Alpha Block" < "Zeta Block" → ZConfig first
    expect(catalog[0].name).toBe("ZConfig")
    expect(catalog[1].name).toBe("AMerged")
  })
})

// ---------------------------------------------------------------------------
// ALL_CATEGORIES
// ---------------------------------------------------------------------------

describe("ALL_CATEGORIES", () => {
  it("contains exactly 4 categories", () => {
    expect(ALL_CATEGORIES).toHaveLength(4)
    expect(ALL_CATEGORIES).toContain("Media")
    expect(ALL_CATEGORIES).toContain("Layout")
    expect(ALL_CATEGORIES).toContain("Content")
    expect(ALL_CATEGORIES).toContain("Custom")
  })
})

