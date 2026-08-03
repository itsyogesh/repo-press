import { describe, expect, it } from "vitest"
import { computeRegistryItemIntegrity } from "../registry-integrity"
import { type RegistrySourceInput, resolveRegistryItems } from "../registry-resolver"

const RESOLVED_REF = "0123456789abcdef0123456789abcdef01234567"

function source(
  logicalId: string,
  dependencies: string[] = [],
  options: { reference?: string; frameworks?: Array<"next" | "fumadocs" | "astro">; built?: boolean } = {},
): RegistrySourceInput {
  const name = logicalId.split("/").at(-1) ?? logicalId
  const path = `registry/${name}.tsx`
  const content = `export function ${name[0].toUpperCase()}${name.slice(1)}() { return null }\n`
  const item: Record<string, any> = {
    name,
    type: "registry:component",
    registryDependencies: dependencies,
    files: [
      { path, type: "registry:component", target: `@components/${name}.tsx`, ...(options.built ? { content } : {}) },
    ],
    meta: {
      repopress: {
        apiVersion: 1,
        version: "1.0.0",
        kind: "mdx-component",
        logicalId,
        mdxName: name[0].toUpperCase() + name.slice(1),
        exportName: name[0].toUpperCase() + name.slice(1),
        frameworks: options.frameworks ?? ["next", "fumadocs"],
        preview: { fixtures: [] },
        authoring: {
          runtime: "client",
          schemaStatus: "complete",
          props: [],
          slots: [],
          provenance: {
            source: "registry",
            registryItem: logicalId,
            version: "1.0.0",
            integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          },
        },
      },
    },
  }
  const files = [{ path, content }]
  item.meta.repopress.authoring.provenance.integrity = computeRegistryItemIntegrity({ item, files })
  return {
    reference: options.reference ?? logicalId,
    item,
    files,
    resolved: {
      address: `https://registry.example/items/${name}.json`,
      sourceRef: "v1.0.0",
      resolvedRef: RESOLVED_REF,
    },
  }
}

describe("resolveRegistryItems", () => {
  it("resolves recursive dependencies once in deterministic dependency-first order", () => {
    const inputs = [
      source("@example/card", ["button", "icon"]),
      source("@example/icon", [], { reference: "icon" }),
      source("@example/button", ["icon"], { reference: "button" }),
    ]
    const resolved = resolveRegistryItems({
      requested: ["@example/card", "button"],
      sources: inputs,
      framework: "next",
    })

    expect(resolved.map((entry) => entry.logicalId)).toEqual(["@example/icon", "@example/button", "@example/card"])
    expect(resolved[2].dependencies).toEqual(["@example/button", "@example/icon"])
    expect(Object.isFrozen(resolved)).toBe(true)
    expect(Object.isFrozen(resolved[0].files)).toBe(true)

    ;(inputs[1].files[0] as { content: string }).content = "changed"
    expect(resolved[0].files[0].content).not.toBe("changed")
  })

  it("reports the complete useful dependency path for cycles", () => {
    expect(() =>
      resolveRegistryItems({
        requested: ["a"],
        sources: [
          source("@example/a", ["b"], { reference: "a" }),
          source("@example/b", ["c"], { reference: "b" }),
          source("@example/c", ["a"], { reference: "c" }),
        ],
        framework: "next",
      }),
    ).toThrow("@example/a -> @example/b -> @example/c -> @example/a")
  })

  it("rejects duplicate logical identities and ambiguous dependency references", () => {
    expect(() =>
      resolveRegistryItems({
        requested: ["one"],
        sources: [source("@example/same", [], { reference: "one" }), source("@example/same", [], { reference: "two" })],
        framework: "next",
      }),
    ).toThrow("Duplicate registry logical identity")

    expect(() =>
      resolveRegistryItems({
        requested: ["shared"],
        sources: [
          source("@one/shared", [], { reference: "shared" }),
          source("@two/shared", [], { reference: "shared" }),
        ],
        framework: "next",
      }),
    ).toThrow("Ambiguous registry reference shared")
  })

  it("verifies declared integrity and treats matching source and built representations equivalently", () => {
    const sourceForm = source("@example/callout")
    const builtForm = source("@example/callout", [], { built: true })
    expect(
      resolveRegistryItems({ requested: ["@example/callout"], sources: [sourceForm], framework: "next" })[0].integrity,
    ).toBe(
      resolveRegistryItems({ requested: ["@example/callout"], sources: [builtForm], framework: "next" })[0].integrity,
    )

    ;(sourceForm.files[0] as { content: string }).content += "// tampered"
    expect(() =>
      resolveRegistryItems({ requested: ["@example/callout"], sources: [sourceForm], framework: "next" }),
    ).toThrow("Registry integrity mismatch")
  })

  it("fails closed for incompatible frameworks, unknown refs, and bounded input violations", () => {
    expect(() =>
      resolveRegistryItems({
        requested: ["astro"],
        sources: [source("@example/astro", [], { reference: "astro", frameworks: ["astro"] })],
        framework: "next",
      }),
    ).toThrow("does not support next")
    expect(() => resolveRegistryItems({ requested: ["missing"], sources: [], framework: "next" })).toThrow(
      "Unknown registry reference missing",
    )
    expect(() =>
      resolveRegistryItems({
        requested: Array.from({ length: 513 }, (_, index) => `item-${index}`),
        sources: [],
        framework: "next",
      }),
    ).toThrow("requested item limit")
  })

  it("rejects accessor-backed source arrays without invoking them", () => {
    const sources: RegistrySourceInput[] = []
    sources.length = 1
    let calls = 0
    Object.defineProperty(sources, 0, {
      enumerable: true,
      get: () => {
        calls += 1
        throw new Error("must not run")
      },
    })

    expect(() => resolveRegistryItems({ requested: ["item"], sources, framework: "next" })).toThrow("own data property")
    expect(calls).toBe(0)
  })
})
