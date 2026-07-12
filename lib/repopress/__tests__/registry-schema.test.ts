import { describe, expect, it } from "vitest"
import { registryItemSchema } from "../registry-schema"

function validItem() {
  return {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: "callout",
    type: "registry:component",
    title: "Callout",
    description: "A semantic notice.",
    registryDependencies: ["button"],
    dependencies: ["lucide-react@0.468.0"],
    files: [{ path: "registry/repopress/callout/callout.tsx", type: "registry:component" }],
    meta: {
      repopress: {
        apiVersion: 1,
        version: "1.2.0",
        authoring: {
          logicalId: "@repopress/callout",
          mdxName: "Callout",
          displayName: "Callout box",
          description: "Highlights important information.",
          runtime: "client",
          kind: "flow",
          props: [
            {
              name: "variant",
              type: "string",
              label: "Variant",
              required: true,
              description: "Visual emphasis",
              options: ["info", "warning"],
              placeholder: "Choose a variant",
              default: "info",
            },
          ],
          slots: [{ name: "children", accepts: "mdx", required: true }],
          assets: [{ path: "registry/repopress/callout/callout.css", type: "style" }],
          fixtures: ["registry/repopress/callout/fixture.mdx"],
          provenance: {
            source: "registry",
            registryItem: "@repopress/callout",
            version: "1.2.0",
            integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          },
        },
      },
    },
  }
}

describe("registryItemSchema", () => {
  it("preserves standard shadcn fields and complete declarative RepoPress metadata", () => {
    const item = validItem()
    ;(item.meta as Record<string, unknown>).vendor = { searchable: true }
    const result = registryItemSchema.parse(item)

    expect(result.registryDependencies).toEqual(["button"])
    expect(result.files?.[0]).toEqual({
      path: "registry/repopress/callout/callout.tsx",
      type: "registry:component",
    })
    expect(result.meta.repopress.authoring.props?.[0]).toMatchObject({
      required: true,
      description: "Visual emphasis",
      options: ["info", "warning"],
      placeholder: "Choose a variant",
    })
    expect(result.meta.repopress.authoring).toMatchObject({
      displayName: "Callout box",
      runtime: "client",
      fixtures: ["registry/repopress/callout/fixture.mdx"],
      assets: [{ path: "registry/repopress/callout/callout.css", type: "style" }],
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.meta.repopress.authoring.props)).toBe(true)
    expect(result.meta.vendor).toEqual({ searchable: true })
  })

  it.each([0, 2, "1"])("rejects unknown or malformed API version %p", (apiVersion) => {
    const item = validItem()
    ;(item.meta.repopress as { apiVersion: unknown }).apiVersion = apiVersion
    expect(registryItemSchema.safeParse(item).success).toBe(false)
  })

  it.each([
    { implementation: "() => null" },
    { render: "function render() {}" },
    { authoring: { ...validItem().meta.repopress.authoring, description: "javascript:alert(1)" } },
  ])("rejects executable metadata %#", (addition) => {
    const item = validItem()
    item.meta.repopress = { ...item.meta.repopress, ...addition } as typeof item.meta.repopress
    expect(registryItemSchema.safeParse(item).success).toBe(false)
  })

  it("rejects dangerous keys, non-JSON values, malformed addresses, and malformed integrity", () => {
    const dangerous = validItem() as Record<string, unknown>
    Object.defineProperty(dangerous, "constructor", { value: "poison", enumerable: true })
    expect(registryItemSchema.safeParse(dangerous).success).toBe(false)

    const nonJson = validItem()
    ;(nonJson.meta.repopress.authoring.props[0] as Record<string, unknown>).default = Number.NaN
    expect(registryItemSchema.safeParse(nonJson).success).toBe(false)

    const badAddress = validItem()
    badAddress.registryDependencies = ["http://registry.example/item.json"]
    expect(registryItemSchema.safeParse(badAddress).success).toBe(false)

    const badIntegrity = validItem()
    badIntegrity.meta.repopress.authoring.provenance.integrity = "sha256-not-base64!"
    expect(registryItemSchema.safeParse(badIntegrity).success).toBe(false)
  })

  it("rejects unknown RepoPress fields and bounded collection overflows", () => {
    const unknown = validItem()
    ;(unknown.meta.repopress as Record<string, unknown>).apiVerison = 1
    expect(registryItemSchema.safeParse(unknown).success).toBe(false)

    const oversized = validItem()
    oversized.meta.repopress.authoring.fixtures = Array.from({ length: 129 }, (_, index) => `fixture-${index}.mdx`)
    expect(registryItemSchema.safeParse(oversized).success).toBe(false)
  })

  it("rejects dangerous logical identifiers and duplicate authoring names", () => {
    const dangerous = validItem()
    dangerous.meta.repopress.authoring.logicalId = "constructor"
    expect(registryItemSchema.safeParse(dangerous).success).toBe(false)

    const duplicate = validItem()
    duplicate.meta.repopress.authoring.props.push({
      ...duplicate.meta.repopress.authoring.props[0],
      name: "variant",
    })
    expect(registryItemSchema.safeParse(duplicate).success).toBe(false)
  })

  it("accepts official root-relative shadcn targets without allowing tilde elsewhere", () => {
    const item = validItem()
    item.files = [{ path: "registry/env", type: "registry:file", target: "~/.env.example" }] as never
    expect(registryItemSchema.safeParse(item).success).toBe(true)

    item.files = [{ path: "registry/env", type: "registry:file", target: "components/~/env" }] as never
    expect(registryItemSchema.safeParse(item).success).toBe(false)
  })
})
