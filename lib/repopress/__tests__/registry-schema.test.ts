import { describe, expect, it } from "vitest"
import { buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"
import { repoPressLockSchema } from "../lock-schema"
import { canonicalizeInstallTarget, normalizeRegistryAuthoringMetadata, registryItemSchema } from "../registry-schema"

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
        kind: "mdx-component",
        logicalId: "@repopress/callout",
        mdxName: "Callout",
        exportName: "Callout",
        frameworks: ["next", "fumadocs"],
        preview: {
          fixtures: ["registry/repopress/callout/fixture.mdx"],
          defaultFixture: "registry/repopress/callout/fixture.mdx",
        },
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
          previewFixtures: ["registry/repopress/callout/fixture.mdx"],
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
      previewFixtures: ["registry/repopress/callout/fixture.mdx"],
      assets: [{ path: "registry/repopress/callout/callout.css", type: "style" }],
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.meta.repopress.authoring.props)).toBe(true)
    expect(result.meta.vendor).toEqual({ searchable: true })
  })

  it("normalizes registry metadata into the AuthoringCatalog field vocabulary", () => {
    const normalized = normalizeRegistryAuthoringMetadata(validItem())
    expect(normalized).toMatchObject({
      logicalId: "@repopress/callout",
      mdxName: "Callout",
      version: "1.2.0",
      frameworks: ["next", "fumadocs"],
      previewFixtures: ["registry/repopress/callout/fixture.mdx"],
      defaultFixture: "registry/repopress/callout/fixture.mdx",
      exportName: "Callout",
      assets: [{ path: "registry/repopress/callout/callout.css", type: "style" }],
      provenance: {
        source: "registry",
        registryItem: "@repopress/callout",
        version: "1.2.0",
      },
    })
    expect(Object.isFrozen(normalized)).toBe(true)
  })

  it("preserves one normalized contract through registry, catalog, and lock", () => {
    const normalized = normalizeRegistryAuthoringMetadata(validItem())
    const [catalogEntry] = buildAuthoringCatalog({ metadata: { Callout: normalized } })
    expect(catalogEntry).toStrictEqual(normalized)

    const digest = `sha256:${"a".repeat(64)}`
    const lock = repoPressLockSchema.parse({
      lockfileVersion: 1,
      items: {
        "@repopress/callout": {
          resolved: {
            address: "https://registry.example/r/callout.json",
            sourceRef: "v1.2.0",
            resolvedRef: "0123456789abcdef0123456789abcdef01234567",
          },
          integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          dependencies: [],
          targets: [{ path: "components/Callout.tsx", digest }],
          authoring: catalogEntry,
          localModificationDigest: digest,
        },
      },
    })
    expect(lock.items["@repopress/callout"].authoring).toStrictEqual(normalized)
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
    oversized.meta.repopress.authoring.previewFixtures = Array.from(
      { length: 129 },
      (_, index) => `fixture-${index}.mdx`,
    )
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

  it("supports current shadcn registry:base fields only on base items", () => {
    const item = validItem()
    item.type = "registry:base"
    Object.assign(item, {
      style: "new-york",
      iconLibrary: "lucide",
      baseColor: "neutral",
      theme: "zinc",
    })
    const base = registryItemSchema.parse(item)
    expect(base).toMatchObject({ style: "new-york", iconLibrary: "lucide", baseColor: "neutral", theme: "zinc" })

    item.type = "registry:component"
    expect(registryItemSchema.safeParse(item).success).toBe(false)

    const withLegacyConfig = { ...validItem(), config: { style: "new-york" } }
    expect(registryItemSchema.safeParse(withLegacyConfig).success).toBe(false)
  })

  it.each([
    'console.log("x")',
    "alert(1)",
    "class X {}",
    "function run() {}",
    "new Function('return 1')",
    "eval('1')",
    "value => value",
    "import x from 'x'",
    "export default 1",
    '<button onClick="run()">Go</button>',
    "<script>alert(1)</script>",
    "javascript:alert(1)",
    "const x = 1",
    "let x = 1",
    "var x = 1",
    "globalThis.eval('1')",
    "window.alert(1)",
    "(0, eval)('1')",
    "async value => value",
    "fetch('/api')",
    "require('fs')",
    "doWork()",
    "while (true) {}",
    "document.cookie = 'x'",
  ])("rejects standalone executable declarative text: %s", (description) => {
    const item = validItem()
    item.meta.repopress.authoring.description = description
    expect(registryItemSchema.safeParse(item).success).toBe(false)
  })

  it.each([
    "This function describes how the Callout behaves.",
    "The docs mention alert(1) as an example, but do not execute it.",
    'Use `console.log("x")` while debugging.',
    "import maps describe module resolution.",
    "export controls determine package visibility.",
    "class names use PascalCase.",
    "const assertions preserve literal types.",
  ])("allows inert explanatory prose: %s", (description) => {
    const item = validItem()
    item.meta.repopress.authoring.description = description
    expect(registryItemSchema.safeParse(item).success).toBe(true)
  })

  it("does not scan unrelated shadcn docs or vendor metadata as RepoPress executable truth", () => {
    const item = validItem()
    ;(item as typeof item & { docs: string }).docs = 'Run console.log("x") in your application after installation.'
    ;(item.meta as Record<string, unknown>).vendor = {
      example: "value => value",
      toString: "display helper",
      valueOf: "display value",
    }
    const parsed = registryItemSchema.parse(item)
    expect(parsed.meta.vendor).toEqual({
      example: "value => value",
      toString: "display helper",
      valueOf: "display value",
    })
  })

  it("rejects nested array accessors without invoking them", () => {
    const item = validItem()
    const values: unknown[] = []
    let calls = 0
    Object.defineProperty(values, 0, {
      enumerable: true,
      get: () => {
        calls += 1
        return "unsafe"
      },
    })
    ;(item.meta as Record<string, unknown>).vendor = { values }
    expect(registryItemSchema.safeParse(item).success).toBe(false)
    expect(calls).toBe(0)
  })

  it("canonicalizes install target identities and rejects cross-platform hazards", () => {
    expect(canonicalizeInstallTarget("~/Components/./Café.tsx")).toBe("components/café.tsx")
    expect(canonicalizeInstallTarget("components\\Callout.tsx")).toBe("components/callout.tsx")
    expect(() => canonicalizeInstallTarget("components/CON.tsx")).toThrow("reserved")
    expect(() => canonicalizeInstallTarget("components/name. ")).toThrow("trailing")
    expect(() => canonicalizeInstallTarget("components/\u202ecallout.tsx")).toThrow("control")

    const duplicate = validItem()
    duplicate.files = [
      { path: "registry/Callout.tsx", type: "registry:component", target: "~/Components/Callout.tsx" },
      { path: "registry/other.tsx", type: "registry:component", target: "components/callout.tsx" },
    ] as never
    expect(registryItemSchema.safeParse(duplicate).success).toBe(false)

    const reserved = validItem()
    reserved.files = [{ path: "registry/con.tsx", type: "registry:component", target: "components/CON.tsx" }] as never
    expect(registryItemSchema.safeParse(reserved).success).toBe(false)
  })

  it("rejects oversized containers before visiting their entries", () => {
    const item = validItem()
    const files: unknown[] = []
    files.length = 10_001
    let visited = false
    Object.defineProperty(files, 0, {
      enumerable: true,
      get: () => {
        visited = true
        throw new Error("must not visit")
      },
    })
    item.files = files as never
    expect(registryItemSchema.safeParse(item).success).toBe(false)
    expect(visited).toBe(false)
  })
})
