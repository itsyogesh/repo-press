import { describe, expect, it } from "vitest"
import { bodyEmbedsMetadataExport, detectMetadataSource, serializePublishContent } from "@/lib/publish-content"

describe("detectMetadataSource", () => {
  it("detects YAML frontmatter files", () => {
    expect(detectMetadataSource("---\ntitle: Hi\n---\n\n# Body\n", "docs/a.md")).toBe("frontmatter")
    expect(detectMetadataSource("---\ntitle: Hi\n---\n\n# Body\n", "docs/a.mdx")).toBe("frontmatter")
  })

  it("detects a BOM-prefixed YAML frontmatter file", () => {
    expect(detectMetadataSource("﻿---\ntitle: Hi\n---\n\nBody\n", "docs/a.mdx")).toBe("frontmatter")
  })

  it("detects export const metadata in MDX files", () => {
    const source = 'export const metadata = {\n  title: "Hi",\n}\n\n# Body\n'
    expect(detectMetadataSource(source, "docs/a.mdx")).toBe("metadata-export")
  })

  it("never reports metadata-export for non-MDX files", () => {
    const source = 'export const metadata = { title: "Hi" }\n\n# Body\n'
    expect(detectMetadataSource(source, "docs/a.md")).toBe("none")
  })

  it("ignores export const metadata inside fenced code blocks", () => {
    const source = 'Some intro.\n\n```ts\nexport const metadata = { title: "Docs about metadata" }\n```\n'
    expect(detectMetadataSource(source, "docs/a.mdx")).toBe("none")
  })

  it("ignores export const metadata inside tilde fences", () => {
    const source = "Intro.\n\n~~~\nexport const metadata = { title: 'X' }\n~~~\n"
    expect(detectMetadataSource(source, "docs/a.mdx")).toBe("none")
  })

  it("returns none for plain content", () => {
    expect(detectMetadataSource("# Just markdown\n", "docs/a.mdx")).toBe("none")
  })
})

describe("bodyEmbedsMetadataExport", () => {
  it("finds a top-level metadata export", () => {
    expect(bodyEmbedsMetadataExport('export const metadata = { title: "X" }\n\nBody\n')).toBe(true)
  })

  it("does not match inside code fences", () => {
    expect(bodyEmbedsMetadataExport('```\nexport const metadata = { title: "X" }\n```\n')).toBe(false)
  })

  it("does not match indented (non-top-level) lines", () => {
    expect(bodyEmbedsMetadataExport('    export const metadata = { title: "X" }\n')).toBe(false)
  })
})

describe("serializePublishContent", () => {
  it("round-trips a YAML frontmatter document", () => {
    const result = serializePublishContent({
      filePath: "docs/a.mdx",
      body: "# Body\n",
      frontmatter: { title: "Hi" },
      metadataSource: "frontmatter",
    })
    expect(result).toEqual({ ok: true, content: expect.stringMatching(/^---\ntitle: Hi\n---\n/) })
  })

  it("keeps a body that already embeds export const metadata verbatim when frontmatter is empty", () => {
    const body = 'export const metadata = {\n  title: "Hi",\n}\n\n# Body\n'
    const result = serializePublishContent({
      filePath: "docs/a.mdx",
      body,
      frontmatter: {},
      metadataSource: "metadata-export",
    })
    expect(result).toEqual({ ok: true, content: body })
  })

  it("refuses to publish duplicate metadata (embedded export + separate frontmatter)", () => {
    const body = 'export const metadata = { title: "Hi" }\n\n# Body\n'
    const result = serializePublishContent({
      filePath: "docs/a.mdx",
      body,
      frontmatter: { title: "Conflicting" },
      metadataSource: "metadata-export",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/metadata/i)
    }
  })

  it("re-emits export const metadata for a legacy stripped draft instead of converting to YAML", () => {
    const result = serializePublishContent({
      filePath: "docs/a.mdx",
      body: "# Body\n",
      frontmatter: { title: "Hi" },
      metadataSource: "metadata-export",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toMatch(/^export const metadata = \{\n\s+"title": "Hi"\n\}/)
      expect(result.content).not.toMatch(/^---/)
      expect(result.content).toContain("# Body")
    }
  })

  it("does not introduce an empty YAML block for plain files without metadata", () => {
    const result = serializePublishContent({
      filePath: "docs/a.md",
      body: "# Body\n",
      frontmatter: {},
      metadataSource: "none",
    })
    expect(result).toEqual({ ok: true, content: "# Body\n" })
  })

  it("adds YAML frontmatter to a plain file gaining metadata", () => {
    const result = serializePublishContent({
      filePath: "docs/a.md",
      body: "# Body\n",
      frontmatter: { title: "New" },
      metadataSource: "none",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toMatch(/^---\ntitle: New\n---\n/)
    }
  })

  it("keeps a new MDX file's embedded export verbatim even when metadataSource is none", () => {
    const body = 'export const metadata = { title: "Hi" }\n\n# Body\n'
    const result = serializePublishContent({
      filePath: "docs/new.mdx",
      body,
      frontmatter: {},
      metadataSource: "none",
    })
    expect(result).toEqual({ ok: true, content: body })
  })
})
