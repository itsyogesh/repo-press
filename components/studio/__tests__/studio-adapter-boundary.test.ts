import { describe, expect, it } from "vitest"
import { buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"
import { createStudioAdapterState } from "../studio-adapter-context"

describe("Studio authoring boundary", () => {
  it("accepts only serializable catalog data and native names", () => {
    const authoringCatalog = buildAuthoringCatalog({ nativeComponentNames: ["Callout"] })
    const state = createStudioAdapterState({ authoringCatalog, nativeComponentNames: ["Callout"] })
    expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state)
  })

  it("rejects executable adapter bindings before they enter Studio context", () => {
    const Callout = () => null
    expect(() =>
      createStudioAdapterState({
        authoringCatalog: buildAuthoringCatalog({ nativeComponentNames: ["Callout"] }),
        nativeComponentNames: ["Callout"],
        adapter: { components: { Callout } },
      } as never),
    ).toThrow("unknown Studio adapter state field")
  })

  it("rejects a function hidden inside an allowed context field", () => {
    const catalog = buildAuthoringCatalog({ nativeComponentNames: ["Callout"] })
    expect(() =>
      createStudioAdapterState({
        authoringCatalog: [{ ...catalog[0], implementation: () => null }] as never,
        nativeComponentNames: ["Callout"],
      }),
    ).toThrow("serializable")
  })

  it("rejects mutable catalog aliases that bypass the catalog builder", () => {
    const catalog = JSON.parse(JSON.stringify(buildAuthoringCatalog({ nativeComponentNames: ["Callout"] })))
    expect(() => createStudioAdapterState({ authoringCatalog: catalog, nativeComponentNames: ["Callout"] })).toThrow(
      "canonical validation",
    )
  })

  it.each([
    ["Date", new Date("2026-01-01")],
    ["Map", new Map([["key", "value"]])],
    ["Set", new Set(["value"])],
    ["class instance", new (class CatalogValue {})()],
  ])("rejects %s instances hidden in context state", (_label, value) => {
    const catalog = buildAuthoringCatalog({ nativeComponentNames: ["Callout"] })
    expect(() =>
      createStudioAdapterState({
        authoringCatalog: Object.freeze([...catalog, value]) as never,
        nativeComponentNames: ["Callout"],
      }),
    ).toThrow("plain")
  })

  it("rejects sparse arrays in context state", () => {
    const names = Array(2) as string[]
    names[1] = "Callout"
    expect(() =>
      createStudioAdapterState({ authoringCatalog: buildAuthoringCatalog({}), nativeComponentNames: names }),
    ).toThrow("sparse")
  })
})
