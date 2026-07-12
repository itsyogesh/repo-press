import { describe, expect, it } from "vitest"
import { buildAuthoringCatalog } from "../authoring-catalog"
import { buildComponentCatalog } from "../component-catalog"
import {
  buildCurrentDocumentAuthoringState,
  CURRENT_DOCUMENT_DISCOVERY_DIAGNOSTIC,
  discoverMdxComponentNames,
} from "../component-discovery"

describe("current-document component discovery", () => {
  it("extracts safe JSX names without evaluating source", () => {
    expect(discoverMdxComponentNames("<Callout><Tabs.Item /></Callout>\n<div />")).toEqual(["Callout", "Tabs.Item"])
  })

  it("merges document-only names into the authoring catalog as incomplete", () => {
    const state = buildCurrentDocumentAuthoringState(buildAuthoringCatalog({}), '<Portal target="docs" />')
    expect(state.authoringCatalog).toEqual([
      expect.objectContaining({ mdxName: "Portal", schemaStatus: "incomplete", provenance: { source: "native" } }),
    ])
    expect(state.nativeComponentNames).toEqual(["Portal"])
    expect(state.diagnostics).toContain(CURRENT_DOCUMENT_DISCOVERY_DIAGNOSTIC)
    expect(buildComponentCatalog(state.authoringCatalog).map((component) => component.mdxName)).toContain("Portal")
  })

  it("preserves configured metadata when the same name is discovered", () => {
    const base = buildAuthoringCatalog({
      metadata: { Callout: { props: [{ name: "tone", type: "string" }], hasChildren: true } },
    })
    const state = buildCurrentDocumentAuthoringState(base, '<Callout tone="info">Hello</Callout>')
    expect(state.authoringCatalog).toHaveLength(1)
    expect(state.authoringCatalog[0].schemaStatus).toBe("complete")
  })
})
