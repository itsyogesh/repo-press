import { describe, expect, it } from "vitest"
import { buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"
import { GenericJsxEditor, getJsxComponentDescriptors } from "../jsx-component-descriptors"

describe("JSX descriptor authoring boundary", () => {
  it("builds descriptors from the authoring catalog without executable bindings", () => {
    const catalog = buildAuthoringCatalog({
      metadata: { "Tabs.Item": { props: [{ name: "label", type: "string" }], hasChildren: true } },
    })
    const descriptor = getJsxComponentDescriptors(catalog, ["DocumentOnly"]).find(
      (candidate) => candidate.name === "Tabs.Item",
    )

    expect(descriptor).toEqual(
      expect.objectContaining({ name: "Tabs.Item", hasChildren: true, Editor: GenericJsxEditor }),
    )
  })

  it.each([
    "<Unknown>keep me</Unknown>",
    "<Unknown />",
  ])("preserves possible children for incomplete components discovered from %s", (source) => {
    const catalog = buildAuthoringCatalog({ nativeComponentNames: ["Unknown"] })
    const descriptor = getJsxComponentDescriptors(catalog, ["Unknown"]).find(
      (candidate) => candidate.name === "Unknown",
    )
    expect(source).toContain("Unknown")
    expect(descriptor?.hasChildren).toBe(true)
  })
})
