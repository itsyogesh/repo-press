// ---------------------------------------------------------------------------
// Integration test — full insert pipeline round-trip
// ---------------------------------------------------------------------------
//
// Covers: registry → catalog → node → serializer
// Verifies: deterministic output, round-trip consistency, edge cases
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest"
import { buildComponentCatalog, getComponentLabel } from "../component-catalog"
import { buildComponentNode } from "../component-node"
import type { ConfigComponentEntry } from "../component-registry"
import { buildComponentRegistry } from "../component-registry"
import { serializeComponentNode } from "../component-serializer"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(entries: Record<string, ConfigComponentEntry>) {
  return entries
}

function makeAdapter(
  entries: Record<string, { props?: Array<{ name: string; type: string }>; hasChildren?: boolean }>,
) {
  return entries
}

// ---------------------------------------------------------------------------
// Full pipeline tests
// ---------------------------------------------------------------------------

describe("Integration: full insert pipeline", () => {
  const config = makeConfig({
    DocsImage: {
      props: [
        { name: "src", type: "image", label: "Image URL" },
        { name: "alt", type: "string", label: "Alt Text" },
        { name: "caption", type: "string", label: "Caption" },
      ],
      hasChildren: false,
      kind: "flow",
      displayName: "Documentation Image",
      description: "An image with optional caption.",
    },
    DocsVideo: {
      props: [
        { name: "src", type: "string", label: "Video URL" },
        { name: "title", type: "string", label: "Title" },
      ],
      hasChildren: false,
      kind: "flow",
    },
    Callout: {
      props: [{ name: "type", type: "string", default: "info" }],
      hasChildren: true,
      kind: "flow",
    },
    Badge: {
      props: [],
      hasChildren: true,
      kind: "text",
    },
  })

  const adapter = makeAdapter({
    DocsImage: {
      props: [{ name: "src", type: "string" }],
      hasChildren: false,
    },
    Steps: {
      props: [],
      hasChildren: true,
    },
  })

  it("builds registry with correct source tracking", () => {
    const registry = buildComponentRegistry(adapter, config)

    expect(registry.DocsImage.source).toBe("merged")
    expect(registry.DocsVideo.source).toBe("config")
    expect(registry.Callout.source).toBe("config")
    expect(registry.Badge.source).toBe("config")
    expect(registry.Steps.source).toBe("adapter")
  })

  it("config props win over adapter props for merged entries", () => {
    const registry = buildComponentRegistry(adapter, config)
    const docsImage = registry.DocsImage

    // Config has 3 props (src, alt, caption), adapter has 1 (src)
    // Config should win
    expect(docsImage.props).toHaveLength(3)
    expect(docsImage.props[0].type).toBe("image") // Config type, not adapter's "string"
  })

  it("catalog is sorted alphabetically by display label", () => {
    const registry = buildComponentRegistry(adapter, config)
    const catalog = buildComponentCatalog(registry)

    const labels = catalog.map(getComponentLabel)
    const sorted = [...labels].sort((a, b) => a.localeCompare(b))
    expect(labels).toEqual(sorted)
  })

  it("catalog uses displayName when available", () => {
    const registry = buildComponentRegistry(adapter, config)
    const catalog = buildComponentCatalog(registry)

    const docsImageEntry = catalog.find((c) => c.name === "DocsImage")
    expect(getComponentLabel(docsImageEntry!)).toBe("Documentation Image")
  })

  it("full round-trip: DocsImage with all props filled", () => {
    const registry = buildComponentRegistry(adapter, config)
    const def = registry.DocsImage

    const formState = {
      src: "https://example.com/image.png",
      alt: "Architecture diagram",
      caption: "Figure 1: System overview",
    }

    const node = buildComponentNode(def, formState)
    const jsx = serializeComponentNode(node)

    expect(jsx).toBe(
      '<DocsImage alt="Architecture diagram" caption="Figure 1: System overview" src="https://example.com/image.png" />',
    )
  })

  it("full round-trip: DocsImage with partial props", () => {
    const registry = buildComponentRegistry(adapter, config)
    const def = registry.DocsImage

    const formState = {
      src: "/images/photo.webp",
    }

    const node = buildComponentNode(def, formState)
    const jsx = serializeComponentNode(node)

    expect(jsx).toBe('<DocsImage src="/images/photo.webp" />')
  })

  it("full round-trip: Callout with default + children", () => {
    const registry = buildComponentRegistry(adapter, config)
    const def = registry.Callout

    const formState = {
      // type not provided — should fall back to default "info"
      children: "This is an important note!",
    }

    const node = buildComponentNode(def, formState)
    const jsx = serializeComponentNode(node)

    expect(jsx).toBe('<Callout type="info">\nThis is an important note!\n</Callout>')
  })

  it("full round-trip: Callout with explicit type override", () => {
    const registry = buildComponentRegistry(adapter, config)
    const def = registry.Callout

    const formState = {
      type: "warning",
      children: "Be careful!",
    }

    const node = buildComponentNode(def, formState)
    const jsx = serializeComponentNode(node)

    expect(jsx).toBe('<Callout type="warning">\nBe careful!\n</Callout>')
  })

  it("full round-trip: Badge (inline, no props, with children)", () => {
    const registry = buildComponentRegistry(adapter, config)
    const def = registry.Badge

    const formState = {
      children: "New",
    }

    const node = buildComponentNode(def, formState)
    const jsx = serializeComponentNode(node)

    expect(jsx).toBe("<Badge>\nNew\n</Badge>")
  })

  it("full round-trip: Steps (adapter-only, no props, with children)", () => {
    const registry = buildComponentRegistry(adapter, config)
    const def = registry.Steps

    const formState = {
      children: "Step content here",
    }

    const node = buildComponentNode(def, formState)
    const jsx = serializeComponentNode(node)

    expect(jsx).toBe("<Steps>\nStep content here\n</Steps>")
  })

  it("full round-trip: component with no props and no children inserts self-closing", () => {
    const registry = buildComponentRegistry(adapter, config)
    const def = registry.Steps

    // Steps hasChildren=true, but if no children provided
    const formState = {}

    const node = buildComponentNode(def, formState)
    const jsx = serializeComponentNode(node)

    // hasChildren is true but children is empty, so self-closing
    expect(jsx).toBe("<Steps />")
  })

  it("serializer output is deterministic across multiple calls", () => {
    const registry = buildComponentRegistry(adapter, config)
    const def = registry.DocsImage

    const formState = {
      caption: "Z comes last",
      alt: "A comes first",
      src: "https://example.com/test.png",
    }

    const results = Array.from({ length: 10 }, () => {
      const node = buildComponentNode(def, formState)
      return serializeComponentNode(node)
    })

    // All 10 outputs must be identical
    const unique = new Set(results)
    expect(unique.size).toBe(1)

    // Props must be in lexicographic order (alt, caption, src)
    expect(results[0]).toBe(
      '<DocsImage alt="A comes first" caption="Z comes last" src="https://example.com/test.png" />',
    )
  })

  it("capability flags are correctly derived", () => {
    const registry = buildComponentRegistry(adapter, config)

    // DocsImage has an image prop → media: true
    expect(registry.DocsImage.capabilities?.media).toBe(true)
    expect(registry.DocsImage.capabilities?.configurable).toBe(true)
    expect(registry.DocsImage.capabilities?.inline).toBe(false)

    // Badge is kind: "text" → inline: true
    expect(registry.Badge.capabilities?.inline).toBe(true)
    expect(registry.Badge.capabilities?.configurable).toBe(false)

    // Steps (adapter-only) has no props → configurable: false
    expect(registry.Steps.capabilities?.configurable).toBe(false)
    expect(registry.Steps.capabilities?.media).toBe(false)
  })

  it("handles number and boolean prop types in round-trip", () => {
    const config2 = makeConfig({
      Widget: {
        props: [
          { name: "count", type: "number", label: "Count" },
          { name: "enabled", type: "boolean", label: "Enabled" },
          { name: "title", type: "string", label: "Title" },
        ],
        hasChildren: false,
        kind: "flow",
      },
    })

    const registry = buildComponentRegistry(null, config2)
    const def = registry.Widget

    const formState = {
      count: "42",
      enabled: true,
      title: "My Widget",
    }

    const node = buildComponentNode(def, formState)
    const jsx = serializeComponentNode(node)

    expect(jsx).toBe('<Widget count={42} enabled={true} title="My Widget" />')
  })

  it("handles expression prop type in round-trip", () => {
    const config2 = makeConfig({
      DataView: {
        props: [
          { name: "data", type: "expression", label: "Data Source" },
          { name: "label", type: "string", label: "Label" },
        ],
        hasChildren: false,
        kind: "flow",
      },
    })

    const registry = buildComponentRegistry(null, config2)
    const def = registry.DataView

    const formState = {
      data: "{DOCS_SETUP_MEDIA.cloudflare}",
      label: "Setup Guide",
    }

    const node = buildComponentNode(def, formState)
    const jsx = serializeComponentNode(node)

    expect(jsx).toBe('<DataView data={DOCS_SETUP_MEDIA.cloudflare} label="Setup Guide" />')
  })

  it("escapes special characters in string props", () => {
    const config2 = makeConfig({
      Alert: {
        props: [{ name: "message", type: "string" }],
        hasChildren: false,
        kind: "flow",
      },
    })

    const registry = buildComponentRegistry(null, config2)
    const def = registry.Alert

    const formState = {
      message: 'He said "hello" and\\goodbye',
    }

    const node = buildComponentNode(def, formState)
    const jsx = serializeComponentNode(node)

    expect(jsx).toBe('<Alert message="He said \\"hello\\" and\\\\goodbye" />')
  })

  it("empty registry produces empty catalog", () => {
    const registry = buildComponentRegistry(null, null)
    const catalog = buildComponentCatalog(registry)
    expect(catalog).toEqual([])
  })

  it("preserves optional metadata through the pipeline", () => {
    const config2 = makeConfig({
      MyComponent: {
        props: [],
        hasChildren: false,
        kind: "flow",
        version: 2,
        displayName: "My Custom Component",
        description: "A custom component for testing.",
      },
    })

    const registry = buildComponentRegistry(null, config2)
    const def = registry.MyComponent

    expect(def.version).toBe(2)
    expect(def.displayName).toBe("My Custom Component")
    expect(def.description).toBe("A custom component for testing.")

    const catalog = buildComponentCatalog(registry)
    const entry = catalog[0]
    expect(getComponentLabel(entry)).toBe("My Custom Component")
  })
})
