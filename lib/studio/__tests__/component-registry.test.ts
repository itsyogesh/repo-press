import { describe, expect, it } from "vitest"
import {
  type AdapterComponentEntry,
  buildComponentRegistry,
  type ConfigComponentEntry,
  deriveCapabilities,
  getFrameworkFallbacks,
} from "../component-registry"

// ---------------------------------------------------------------------------
// deriveCapabilities
// ---------------------------------------------------------------------------

describe("deriveCapabilities", () => {
  it("marks inline when kind is text", () => {
    const caps = deriveCapabilities([], "text")
    expect(caps.inline).toBe(true)
  })

  it("does not mark inline when kind is flow", () => {
    const caps = deriveCapabilities([], "flow")
    expect(caps.inline).toBe(false)
  })

  it("marks media when an image prop exists", () => {
    const caps = deriveCapabilities([{ name: "src", type: "image" }], "flow")
    expect(caps.media).toBe(true)
  })

  it("does not mark media when no image prop exists", () => {
    const caps = deriveCapabilities([{ name: "title", type: "string" }], "flow")
    expect(caps.media).toBe(false)
  })

  it("marks configurable when props are present", () => {
    const caps = deriveCapabilities([{ name: "title", type: "string" }], "flow")
    expect(caps.configurable).toBe(true)
  })

  it("does not mark configurable when props are empty", () => {
    const caps = deriveCapabilities([], "flow")
    expect(caps.configurable).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildComponentRegistry — config-only
// ---------------------------------------------------------------------------

describe("buildComponentRegistry — config-only", () => {
  it("creates registry entries from config components", () => {
    const config: Record<string, ConfigComponentEntry> = {
      DocsImage: {
        props: [
          { name: "src", type: "image", label: "Source" },
          { name: "alt", type: "string" },
        ],
        hasChildren: false,
        kind: "flow",
      },
    }

    const registry = buildComponentRegistry(null, config)

    expect(registry.DocsImage).toBeDefined()
    expect(registry.DocsImage.name).toBe("DocsImage")
    expect(registry.DocsImage.source).toBe("config")
    expect(registry.DocsImage.props).toHaveLength(2)
    expect(registry.DocsImage.hasChildren).toBe(false)
    expect(registry.DocsImage.kind).toBe("flow")
  })

  it("propagates optional metadata (version, displayName, description)", () => {
    const config: Record<string, ConfigComponentEntry> = {
      Alert: {
        props: [],
        version: 2,
        displayName: "Alert Box",
        description: "Shows an alert message",
      },
    }

    const registry = buildComponentRegistry(null, config)

    expect(registry.Alert.version).toBe(2)
    expect(registry.Alert.displayName).toBe("Alert Box")
    expect(registry.Alert.description).toBe("Shows an alert message")
  })

  it("defaults hasChildren to true when omitted", () => {
    const config: Record<string, ConfigComponentEntry> = {
      Card: { props: [] },
    }

    const registry = buildComponentRegistry(null, config)
    expect(registry.Card.hasChildren).toBe(true)
  })

  it("defaults kind to flow when omitted", () => {
    const config: Record<string, ConfigComponentEntry> = {
      Card: { props: [] },
    }

    const registry = buildComponentRegistry(null, config)
    expect(registry.Card.kind).toBe("flow")
  })

  it("normalizes unknown prop types to string", () => {
    const config: Record<string, ConfigComponentEntry> = {
      Widget: {
        props: [{ name: "data", type: "unknown_type" as any }],
      },
    }

    const registry = buildComponentRegistry(null, config)
    expect(registry.Widget.props[0].type).toBe("string")
  })

  it("computes capability flags correctly", () => {
    const config: Record<string, ConfigComponentEntry> = {
      DocsImage: {
        props: [{ name: "src", type: "image" }],
        hasChildren: false,
        kind: "flow",
      },
      Badge: {
        props: [{ name: "variant", type: "string" }],
        hasChildren: true,
        kind: "text",
      },
      Divider: {
        props: [],
        hasChildren: false,
        kind: "flow",
      },
    }

    const registry = buildComponentRegistry(null, config)

    expect(registry.DocsImage.capabilities?.media).toBe(true)
    expect(registry.DocsImage.capabilities?.inline).toBe(false)
    expect(registry.DocsImage.capabilities?.configurable).toBe(true)

    expect(registry.Badge.capabilities?.inline).toBe(true)
    expect(registry.Badge.capabilities?.media).toBe(false)
    expect(registry.Badge.capabilities?.configurable).toBe(true)

    expect(registry.Divider.capabilities?.configurable).toBe(false)
    expect(registry.Divider.capabilities?.media).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildComponentRegistry — adapter-only
// ---------------------------------------------------------------------------

describe("buildComponentRegistry — adapter-only", () => {
  it("creates registry entries from adapter components", () => {
    const adapter: Record<string, AdapterComponentEntry> = {
      Callout: {
        props: [{ name: "type", type: "string" }],
        hasChildren: true,
        kind: "flow",
      },
    }

    const registry = buildComponentRegistry(adapter, null)

    expect(registry.Callout).toBeDefined()
    expect(registry.Callout.source).toBe("adapter")
    expect(registry.Callout.props).toHaveLength(1)
  })

  it("does not propagate metadata for adapter-only entries", () => {
    const adapter: Record<string, AdapterComponentEntry> = {
      Tabs: { props: [] },
    }

    const registry = buildComponentRegistry(adapter, null)

    expect(registry.Tabs.version).toBeUndefined()
    expect(registry.Tabs.displayName).toBeUndefined()
    expect(registry.Tabs.description).toBeUndefined()
  })

  it("applies fallback schema for DocsImage when adapter only exposes a function", () => {
    const registry = buildComponentRegistry({ DocsImage: () => null } as any, null, "fumadocs")

    expect(registry.DocsImage.source).toBe("adapter")
    expect(registry.DocsImage.hasChildren).toBe(false)
    expect(registry.DocsImage.props.map((p) => `${p.name}:${p.type}`)).toEqual([
      "src:image",
      "alt:string",
      "caption:string",
    ])
  })

  it("applies fallback schema for DocsVideo when adapter only exposes a function", () => {
    const registry = buildComponentRegistry({ DocsVideo: () => null } as any, null, "fumadocs")

    expect(registry.DocsVideo.source).toBe("adapter")
    expect(registry.DocsVideo.hasChildren).toBe(false)
    expect(registry.DocsVideo.props.map((p) => `${p.name}:${p.type}`)).toEqual(["src:string", "title:string"])
  })
})

// ---------------------------------------------------------------------------
// buildComponentRegistry — merge (collision) behavior
// ---------------------------------------------------------------------------

describe("buildComponentRegistry — merge collisions", () => {
  it("marks source as merged when both config and adapter define the same component", () => {
    const adapter: Record<string, AdapterComponentEntry> = {
      Callout: {
        props: [{ name: "type", type: "string" }],
        hasChildren: true,
      },
    }
    const config: Record<string, ConfigComponentEntry> = {
      Callout: {
        props: [
          { name: "type", type: "string" },
          { name: "title", type: "string" },
        ],
        hasChildren: true,
        kind: "flow",
      },
    }

    const registry = buildComponentRegistry(adapter, config)

    expect(registry.Callout.source).toBe("merged")
  })

  it("config props take precedence over adapter props in merge", () => {
    const adapter: Record<string, AdapterComponentEntry> = {
      Callout: {
        props: [{ name: "type", type: "string" }],
      },
    }
    const config: Record<string, ConfigComponentEntry> = {
      Callout: {
        props: [
          { name: "type", type: "string" },
          { name: "title", type: "string" },
          { name: "icon", type: "expression" },
        ],
      },
    }

    const registry = buildComponentRegistry(adapter, config)

    // Config has 3 props, adapter has 1 — config wins
    expect(registry.Callout.props).toHaveLength(3)
    expect(registry.Callout.props.map((p) => p.name)).toEqual(["type", "title", "icon"])
  })

  it("combines adapter-only and config-only components into one registry", () => {
    const adapter: Record<string, AdapterComponentEntry> = {
      Tabs: { props: [], hasChildren: true },
    }
    const config: Record<string, ConfigComponentEntry> = {
      DocsImage: {
        props: [{ name: "src", type: "image" }],
        hasChildren: false,
      },
    }

    const registry = buildComponentRegistry(adapter, config)

    expect(Object.keys(registry).sort()).toEqual(["DocsImage", "Tabs"])
    expect(registry.Tabs.source).toBe("adapter")
    expect(registry.DocsImage.source).toBe("config")
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("buildComponentRegistry — edge cases", () => {
  it("returns empty registry for null/undefined inputs", () => {
    expect(buildComponentRegistry(null, null)).toEqual({})
    expect(buildComponentRegistry(undefined, undefined)).toEqual({})
  })

  it("returns empty registry for empty objects", () => {
    expect(buildComponentRegistry({}, {})).toEqual({})
  })

  it("handles missing props array gracefully", () => {
    const config: Record<string, ConfigComponentEntry> = {
      Spacer: {} as ConfigComponentEntry,
    }

    const registry = buildComponentRegistry(null, config)
    expect(registry.Spacer.props).toEqual([])
  })

  it("is deterministic — same inputs produce identical output", () => {
    const adapter: Record<string, AdapterComponentEntry> = {
      B: { props: [] },
      A: { props: [{ name: "x", type: "number" }] },
    }
    const config: Record<string, ConfigComponentEntry> = {
      C: { props: [] },
    }

    const r1 = buildComponentRegistry(adapter, config)
    const r2 = buildComponentRegistry(adapter, config)

    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })
})

// ---------------------------------------------------------------------------
// buildComponentRegistry — React component functions (Bug 2 regression)
// ---------------------------------------------------------------------------

describe("buildComponentRegistry — React function components", () => {
  it("treats bare functions as existence-only adapter entries", () => {
    // Simulates adapter.components = Record<string, React.ComponentType>
    const adapterWithFunctions: Record<string, unknown> = {
      DocsImage: () => null, // React function component
      Callout: () => null,
    }

    const registry = buildComponentRegistry(adapterWithFunctions as any, null, "fumadocs")

    expect(registry.DocsImage).toBeDefined()
    expect(registry.DocsImage.source).toBe("adapter")
    expect(registry.DocsImage.props.map((p) => p.name)).toEqual(["src", "alt", "caption"])
    expect(registry.DocsImage.hasChildren).toBe(false)
    expect(registry.DocsImage.kind).toBe("flow")

    expect(registry.Callout).toBeDefined()
    expect(registry.Callout.source).toBe("adapter")
  })

  it("merges function adapter with config — config provides props", () => {
    const adapterWithFunctions: Record<string, unknown> = {
      DocsImage: () => null,
    }
    const config: Record<string, ConfigComponentEntry> = {
      DocsImage: {
        props: [
          { name: "src", type: "image", label: "Source" },
          { name: "alt", type: "string" },
        ],
        hasChildren: false,
        kind: "flow",
        displayName: "Image",
        description: "Documentation image",
      },
    }

    const registry = buildComponentRegistry(adapterWithFunctions as any, config)

    expect(registry.DocsImage.source).toBe("merged")
    expect(registry.DocsImage.props).toHaveLength(2)
    expect(registry.DocsImage.props[0].name).toBe("src")
    expect(registry.DocsImage.hasChildren).toBe(false)
    expect(registry.DocsImage.displayName).toBe("Image")
    expect(registry.DocsImage.description).toBe("Documentation image")
    expect(registry.DocsImage.capabilities?.media).toBe(true)
    expect(registry.DocsImage.capabilities?.configurable).toBe(true)
  })

  it("handles mixed functions and schema objects in adapter", () => {
    const adapterMixed: Record<string, unknown> = {
      DocsImage: () => null, // function
      Callout: { props: [{ name: "type", type: "string" }], hasChildren: true }, // schema object
    }

    const registry = buildComponentRegistry(adapterMixed as any, null, "fumadocs")

    // Function for known component → fallback schema props
    expect(registry.DocsImage.props.map((p) => p.name)).toEqual(["src", "alt", "caption"])

    // Schema object → has props
    expect(registry.Callout.props).toHaveLength(1)
    expect(registry.Callout.props[0].name).toBe("type")
  })

  it("does not treat arrays or null as schema objects", () => {
    const adapterWeird: Record<string, unknown> = {
      ArrayComp: [1, 2, 3], // not a schema object
      NullComp: null, // not a schema object
    }

    // Should not crash — non-schema entries become existence-only
    const registry = buildComponentRegistry(adapterWeird as any, null)

    // ArrayComp treated as non-schema (isSchemaObject returns false for arrays)
    expect(registry.ArrayComp).toBeDefined()
    expect(registry.ArrayComp.props).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Extended prop fields
// ---------------------------------------------------------------------------

describe("extended prop fields", () => {
  it("normalizes required field from config", () => {
    const config: Record<string, ConfigComponentEntry> = {
      TestComp: {
        props: [
          { name: "src", type: "image", label: "Source", required: true },
          { name: "alt", type: "string", label: "Alt text" },
        ],
        hasChildren: false,
        kind: "flow",
      },
    }
    const registry = buildComponentRegistry(undefined, config)
    expect(registry.TestComp.props[0].required).toBe(true)
    expect(registry.TestComp.props[1].required).toBeUndefined()
  })

  it("normalizes options field from config", () => {
    const config: Record<string, ConfigComponentEntry> = {
      Callout: {
        props: [
          { name: "type", type: "string", label: "Type", options: ["info", "warning", "error", "tip"] },
        ],
        hasChildren: true,
        kind: "flow",
      },
    }
    const registry = buildComponentRegistry(undefined, config)
    expect(registry.Callout.props[0].options).toEqual(["info", "warning", "error", "tip"])
  })

  it("normalizes description and placeholder from config", () => {
    const config: Record<string, ConfigComponentEntry> = {
      Hero: {
        props: [
          { name: "title", type: "string", label: "Title", description: "The main heading", placeholder: "Enter title..." },
        ],
        hasChildren: false,
        kind: "flow",
      },
    }
    const registry = buildComponentRegistry(undefined, config)
    expect(registry.Hero.props[0].description).toBe("The main heading")
    expect(registry.Hero.props[0].placeholder).toBe("Enter title...")
  })

  it("preserves required on known adapter fallbacks", () => {
    const adapterComponents = { DocsImage: () => null }
    const registry = buildComponentRegistry(adapterComponents as any, undefined, "fumadocs")
    const srcProp = registry.DocsImage.props.find((p: any) => p.name === "src")
    expect(srcProp?.required).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getFrameworkFallbacks
// ---------------------------------------------------------------------------

describe("getFrameworkFallbacks", () => {
  describe("fumadocs", () => {
    it("returns DocsImage, DocsVideo, Callout", () => {
      const fallbacks = getFrameworkFallbacks("fumadocs")
      expect(Object.keys(fallbacks).sort()).toEqual(["Callout", "DocsImage", "DocsVideo"])
    })

    it("DocsImage has image src prop marked required", () => {
      const { DocsImage } = getFrameworkFallbacks("fumadocs")
      const src = DocsImage.props!.find((p) => p.name === "src")
      expect(src?.type).toBe("image")
      expect(src?.required).toBe(true)
    })

    it("Callout has options array", () => {
      const { Callout } = getFrameworkFallbacks("fumadocs")
      const type = Callout.props!.find((p) => p.name === "type")
      expect(type?.options).toEqual(["info", "warning", "error", "tip"])
    })

    it("matches when framework string is 'fumadocs-core'", () => {
      const fallbacks = getFrameworkFallbacks("fumadocs-core")
      expect(fallbacks.DocsImage).toBeDefined()
    })
  })

  describe("nextra", () => {
    it("returns Callout, Steps, Card, Cards, Tab, Tabs", () => {
      const fallbacks = getFrameworkFallbacks("nextra")
      expect(Object.keys(fallbacks).sort()).toEqual(["Callout", "Card", "Cards", "Steps", "Tab", "Tabs"].sort())
    })

    it("Callout has nextra-specific options", () => {
      const { Callout } = getFrameworkFallbacks("nextra")
      const type = Callout.props!.find((p) => p.name === "type")
      expect(type?.options).toContain("default")
      expect(type?.options).not.toContain("tip")
    })

    it("Steps component has no props", () => {
      const { Steps } = getFrameworkFallbacks("nextra")
      expect(Steps.props).toEqual([])
      expect(Steps.hasChildren).toBe(true)
    })
  })

  describe("astro / starlight", () => {
    it("returns Aside, Card, CardGrid, LinkCard for 'astro'", () => {
      const fallbacks = getFrameworkFallbacks("astro")
      expect(Object.keys(fallbacks).sort()).toEqual(["Aside", "Card", "CardGrid", "LinkCard"])
    })

    it("returns the same set for 'starlight'", () => {
      const astro = getFrameworkFallbacks("astro")
      const starlight = getFrameworkFallbacks("starlight")
      expect(Object.keys(astro).sort()).toEqual(Object.keys(starlight).sort())
    })

    it("Aside has caution/danger options", () => {
      const { Aside } = getFrameworkFallbacks("astro")
      const type = Aside.props!.find((p) => p.name === "type")
      expect(type?.options).toContain("caution")
      expect(type?.options).toContain("danger")
    })
  })

  describe("docusaurus", () => {
    it("returns Admonition, Tabs, TabItem", () => {
      const fallbacks = getFrameworkFallbacks("docusaurus")
      expect(Object.keys(fallbacks).sort()).toEqual(["Admonition", "TabItem", "Tabs"])
    })

    it("TabItem value prop is required", () => {
      const { TabItem } = getFrameworkFallbacks("docusaurus")
      const value = TabItem.props!.find((p) => p.name === "value")
      expect(value?.required).toBe(true)
    })
  })

  describe("jekyll / hugo", () => {
    it("returns empty object for jekyll (no JSX components)", () => {
      expect(getFrameworkFallbacks("jekyll")).toEqual({})
    })

    it("returns empty object for hugo", () => {
      expect(getFrameworkFallbacks("hugo")).toEqual({})
    })
  })

  describe("generic / unknown", () => {
    it("returns Callout, Image, Video for unknown framework", () => {
      const fallbacks = getFrameworkFallbacks("some-unknown-framework")
      expect(Object.keys(fallbacks).sort()).toEqual(["Callout", "Image", "Video"])
    })

    it("returns generic defaults when framework is undefined", () => {
      const fallbacks = getFrameworkFallbacks(undefined)
      expect(fallbacks.Callout).toBeDefined()
      expect(fallbacks.Image).toBeDefined()
    })

    it("Image has image-type src prop", () => {
      const { Image } = getFrameworkFallbacks()
      const src = Image.props!.find((p) => p.name === "src")
      expect(src?.type).toBe("image")
      expect(src?.required).toBe(true)
    })
  })

  describe("buildComponentRegistry integration", () => {
    it("uses nextra fallbacks when framework='nextra' and adapter has function component", () => {
      const registry = buildComponentRegistry({ Callout: () => null } as any, null, "nextra")
      // nextra Callout has 'emoji' prop
      const emoji = registry.Callout.props.find((p) => p.name === "emoji")
      expect(emoji).toBeDefined()
    })

    it("uses generic fallbacks when framework is not provided, with legacy DocsImage fallback", () => {
      // generic has Image/Video/Callout; legacy DocsImage/DocsVideo also resolved
      // via KNOWN_ADAPTER_FALLBACKS when no framework is specified (backward compat)
      const registry = buildComponentRegistry({ Image: () => null, DocsImage: () => null } as any, null)
      expect(registry.Image.props.some((p) => p.type === "image")).toBe(true)
      // DocsImage still gets fumadocs-era fallback when no framework is set
      expect(registry.DocsImage.props.map((p) => p.name)).toEqual(["src", "alt", "caption"])
    })

    it("uses astro fallbacks when framework='astro'", () => {
      const registry = buildComponentRegistry({ Aside: () => null } as any, null, "astro")
      expect(registry.Aside).toBeDefined()
      expect(registry.Aside.props.length).toBeGreaterThan(0)
    })
  })
})
