import { describe, expect, it } from "vitest"
import { buildAuthoringCatalog } from "../authoring-catalog"
import { buildComponentCatalog } from "../component-catalog"
import {
  buildCurrentDocumentAuthoringState,
  CURRENT_DOCUMENT_DISCOVERY_DIAGNOSTIC,
  createCurrentDocumentAuthoringStateCache,
  discoverMdxComponents,
  maskHtmlCommentsForDiscovery,
} from "../component-discovery"

describe("current-document component discovery", () => {
  it("extracts safe JSX names without evaluating source", () => {
    expect(discoverMdxComponents("<Callout><Tabs.Item /></Callout>\n<div />").names).toEqual(["Callout", "Tabs.Item"])
  })

  it("excludes component-like text outside actual MDX JSX nodes", () => {
    const source = [
      "`<InlineCode />`",
      "```tsx",
      "<FencedCode />",
      "```",
      "{/* <MdxComment /> */}",
      "<!-- <HtmlComment /> -->",
      'A quoted example: "<Quoted />"',
      "<Actual />",
    ].join("\n")
    expect(discoverMdxComponents(source).names).toEqual(["Actual"])
  })

  it("fails closed on malformed MDX without leaking source", () => {
    const secret = "do-not-leak"
    const result = discoverMdxComponents(`<Broken value={${secret}}>`)
    expect(result.names).toEqual([])
    expect(result.diagnostic).toBe("COMPONENT_DISCOVERY_PARSE_ERROR")
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it("fails closed on an unterminated HTML comment", () => {
    expect(discoverMdxComponents("<!-- never closed\n<Hidden />")).toEqual({
      names: [],
      diagnostic: "COMPONENT_DISCOVERY_HTML_COMMENT_ERROR",
    })
  })

  it("preserves comment-like text inside code and quoted strings", () => {
    expect(discoverMdxComponents("`<!-- <Inline /> -->`\n<Actual />").names).toEqual(["Actual"])
    expect(discoverMdxComponents("```md\n<!-- <Fenced /> -->\n```\n<Actual />").names).toEqual(["Actual"])
    expect(discoverMdxComponents('"<!-- <Quoted /> -->"\n<Actual />')).toEqual({
      names: [],
      diagnostic: "COMPONENT_DISCOVERY_PARSE_ERROR",
    })
  })

  it("masks real HTML comments without changing length or line-ending offsets", () => {
    const source = "Before\r\n<!-- <Hidden />\r\nmore -->\n<Actual />"
    const masked = maskHtmlCommentsForDiscovery(source)
    expect(masked.ok).toBe(true)
    if (!masked.ok) return
    expect(masked.source).toHaveLength(source.length)
    expect([...masked.source.matchAll(/\r\n|\n/g)].map((match) => match.index)).toEqual(
      [...source.matchAll(/\r\n|\n/g)].map((match) => match.index),
    )
    expect(masked.source).not.toContain("Hidden")
  })

  it("preserves UTF-16 offsets around astral characters while masking comments", () => {
    const source = "😀 before\r\n<!-- 😀 <Hidden /> -->\n<Actual />"
    const masked = maskHtmlCommentsForDiscovery(source)
    expect(masked.ok).toBe(true)
    if (!masked.ok) return
    expect(masked.source.length).toBe(source.length)
    expect([...masked.source.matchAll(/\r\n|\n/g)].map((match) => match.index)).toEqual(
      [...source.matchAll(/\r\n|\n/g)].map((match) => match.index),
    )
    expect(masked.source).toContain("😀 before")
    expect(masked.source).not.toContain("Hidden")
    expect(discoverMdxComponents(source)).toEqual({ names: ["Actual"] })
  })

  it("fails closed deterministically when source exceeds parser budgets", () => {
    const source = `<Portal />${"界".repeat(175_000)}`
    expect(discoverMdxComponents(source)).toEqual(discoverMdxComponents(source))
    expect(discoverMdxComponents(source)).toEqual({
      names: [],
      diagnostic: "COMPONENT_DISCOVERY_SOURCE_BYTE_LIMIT",
    })
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

  it("reuses derived authoring state when ordinary text changes preserve the discovered set", () => {
    const cache = createCurrentDocumentAuthoringStateCache()
    const base = buildAuthoringCatalog({})
    const first = cache.resolve(base, discoverMdxComponents("First <Portal />"))
    const second = cache.resolve(base, discoverMdxComponents("Second <Portal />"))
    expect(second).toBe(first)
    expect(second.authoringCatalog).toBe(first.authoringCatalog)
  })
})
