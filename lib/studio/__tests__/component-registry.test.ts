import { describe, expect, it } from "vitest"
import { buildComponentRegistry, deriveCapabilities, getFrameworkFallbacks } from "../component-registry"

describe("deriveCapabilities compatibility helper", () => {
  it("derives declarative capabilities without executable values", () => {
    expect(deriveCapabilities([{ name: "src", type: "image" }], "text")).toEqual({
      inline: true,
      media: true,
      configurable: true,
    })
  })

  it("does not mark flow components inline", () => {
    expect(deriveCapabilities([], "flow").inline).toBe(false)
  })

  it("does not mark components without image props as media", () => {
    expect(deriveCapabilities([{ name: "title", type: "string" }], "flow").media).toBe(false)
  })

  it("does not mark components without props configurable", () => {
    expect(deriveCapabilities([], "flow").configurable).toBe(false)
  })

  it("marks non-image props configurable", () => {
    expect(deriveCapabilities([{ name: "count", type: "number" }], "flow").configurable).toBe(true)
  })

  it("derives all flags deterministically", () => {
    const props = [{ name: "src", type: "image" as const }]
    expect(deriveCapabilities(props, "text")).toStrictEqual(deriveCapabilities(props, "text"))
  })
})

describe("buildComponentRegistry deprecated wrapper", () => {
  it("projects configured metadata into authoring components", () => {
    const registry = buildComponentRegistry(null, {
      Callout: {
        displayName: "Notice",
        props: [{ name: "tone", type: "string", required: true }],
        hasChildren: true,
      },
    })

    expect(registry.Callout).toEqual(
      expect.objectContaining({
        mdxName: "Callout",
        displayName: "Notice",
        schemaStatus: "complete",
        provenance: { source: "manual" },
        slots: [{ name: "children", accepts: "mdx" }],
      }),
    )
  })

  it("uses executable adapter maps only as native name signals", () => {
    const render = () => null
    const registry = buildComponentRegistry({ DocsImage: render }, null, "fumadocs")

    expect(registry.DocsImage).toEqual(
      expect.objectContaining({ mdxName: "DocsImage", schemaStatus: "incomplete", props: [], slots: [] }),
    )
    expect(JSON.stringify(registry)).not.toContain("render")
  })

  it("keeps every native name when metadata configures one component", () => {
    const registry = buildComponentRegistry(
      { Callout: () => null, Steps: () => null },
      { Callout: { props: [{ name: "tone", type: "string" }], hasChildren: false } },
    )

    expect(Object.keys(registry).sort()).toEqual(["Callout", "Steps"])
    expect(registry.Callout.schemaStatus).toBe("complete")
    expect(registry.Steps.schemaStatus).toBe("incomplete")
  })

  it("is deterministic and handles empty inputs", () => {
    expect(buildComponentRegistry(null, null)).toEqual({})
    expect(buildComponentRegistry({ B: 1, A: 2 }, null)).toEqual(buildComponentRegistry({ B: 3, A: 4 }, null))
  })

  it("returns a null-prototype compatibility map for user-controlled keys", () => {
    const registry = buildComponentRegistry(null, { Callout: { props: [], hasChildren: false } })
    expect(Object.getPrototypeOf(registry)).toBeNull()
  })

  it("does not provide framework-name fallback schemas", () => {
    expect(getFrameworkFallbacks("fumadocs")).toEqual({})
    expect(getFrameworkFallbacks("astro")).toEqual({})
  })

  it.each([
    undefined,
    "fumadocs",
    "fumadocs-core",
    "nextra",
    "astro",
    "starlight",
    "docusaurus",
    "custom",
  ])("keeps framework fallback guessing disabled for %s", (framework) => {
    expect(getFrameworkFallbacks(framework)).toEqual({})
  })

  it("normalizes unknown configured prop types without reading implementations", () => {
    const registry = buildComponentRegistry(null, { Widget: { props: [{ name: "data", type: "custom" }] } })
    expect(registry.Widget.props).toEqual([{ name: "data", type: "string" }])
  })

  it("uses flow placement and client runtime defaults for manual metadata", () => {
    const registry = buildComponentRegistry(null, { Widget: {} })
    expect(registry.Widget).toEqual(expect.objectContaining({ kind: "flow", runtime: "client" }))
  })

  it("preserves text placement metadata", () => {
    const registry = buildComponentRegistry(null, { Badge: { kind: "text" } })
    expect(registry.Badge.kind).toBe("text")
  })

  it("preserves false children metadata as an empty slot list", () => {
    const registry = buildComponentRegistry(null, { Image: { hasChildren: false } })
    expect(registry.Image.slots).toEqual([])
  })

  it.each([
    ["function", () => null],
    ["class", class Widget {}],
    ["object", { props: [{ name: "guessed", type: "string" }] }],
    ["array", ["guessed"]],
    ["null", null],
  ])("treats an adapter %s value only as a native name", (_label, binding) => {
    const registry = buildComponentRegistry({ Widget: binding }, null)
    expect(registry.Widget).toEqual(
      expect.objectContaining({ mdxName: "Widget", schemaStatus: "incomplete", props: [], slots: [] }),
    )
  })

  it("lets explicit metadata define a component whose native binding also exists", () => {
    const registry = buildComponentRegistry(
      { Callout: () => null },
      { Callout: { props: [{ name: "tone", type: "string" }], hasChildren: true } },
    )
    expect(registry.Callout).toEqual(
      expect.objectContaining({ schemaStatus: "complete", props: [{ name: "tone", type: "string" }] }),
    )
  })

  it("preserves required, label, options, description, and placeholder metadata", () => {
    const registry = buildComponentRegistry(null, {
      Callout: {
        props: [
          {
            name: "tone",
            type: "string",
            label: "Tone",
            required: true,
            options: ["info", "warning"],
            description: "Visual tone",
            placeholder: "Select",
          },
        ],
      },
    })
    expect(registry.Callout.props[0]).toEqual(
      expect.objectContaining({
        label: "Tone",
        required: true,
        options: ["info", "warning"],
        description: "Visual tone",
        placeholder: "Select",
      }),
    )
  })
})
