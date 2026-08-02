import { describe, expect, it } from "vitest"
import { parseContentFile } from "@/lib/content-metadata"
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

  it("detects metadata exports after a leading comment and import preamble", () => {
    const source =
      '// Keep this preamble\nimport type { Metadata } from "next"\n\nexport const metadata = { title: "Hi" }\n\n# Body\n'
    expect(detectMetadataSource(source, "docs/a.mdx")).toBe("metadata-export")
  })

  it("detects typed and BOM-prefixed metadata exports", () => {
    const source = '\uFEFFexport const metadata: Metadata = { title: "Hi" }\r\n\r\n# Body\r\n'
    expect(detectMetadataSource(source, "docs/a.mdx")).toBe("metadata-export")
  })

  it("conservatively detects split and commented metadata declarations", () => {
    expect(detectMetadataSource('export const\n  metadata: Metadata = { title: "Hi" }\n\n# Body\n', "docs/a.mdx")).toBe(
      "metadata-export",
    )
    expect(detectMetadataSource('export /* keep */ const metadata = { title: "Hi" }\n', "docs/a.mdx")).toBe(
      "metadata-export",
    )
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

  it("does not close a tilde fence with a backtick fence line (mixed markers)", () => {
    const source = "~~~\nsome code\n```\nexport const metadata = { title: 'X' }\n~~~\n"
    expect(detectMetadataSource(source, "docs/a.mdx")).toBe("none")
  })

  it("does not close a backtick fence with a tilde line (mixed markers)", () => {
    const source = "```\n~~~\nexport const metadata = { title: 'X' }\n```\n"
    expect(detectMetadataSource(source, "docs/a.mdx")).toBe("none")
  })

  it("does not close a long fence with a shorter run of the same marker", () => {
    const source = "`````\ncode\n```\nexport const metadata = { title: 'X' }\n`````\n"
    expect(detectMetadataSource(source, "docs/a.mdx")).toBe("none")
  })

  it("closes a fence with a longer run of the same marker and resumes detection", () => {
    const source = "```\ncode\n`````\nexport const metadata = { title: 'X' }\n"
    expect(detectMetadataSource(source, "docs/a.mdx")).toBe("metadata-export")
  })

  it("does not treat a fence-like line with an info string as a close", () => {
    const source = "```ts\ncode\n``` not-a-close\nexport const metadata = { title: 'X' }\n```\n"
    expect(detectMetadataSource(source, "docs/a.mdx")).toBe("none")
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
  it("round-trips parsed metadata without losing or duplicating unrelated ESM", () => {
    const source =
      'import { site } from "./config"\n\nexport const metadata = { title: "Hello" }\nexport const revalidate = 3600\n\n# Body\n'
    const parsed = parseContentFile(source, "docs/a.mdx")

    const result = serializePublishContent({
      filePath: "docs/a.mdx",
      body: parsed.body,
      frontmatter: { ...parsed.metadata },
      metadataSource: parsed.metadataSource,
      existingContent: source,
    })

    expect(result).toEqual({
      ok: true,
      content:
        'export const metadata = {\n  "title": "Hello"\n}\n\nimport { site } from "./config"\n\nexport const revalidate = 3600\n\n# Body\n',
    })
    if (result.ok) {
      expect(result.content.match(/export const metadata/g)).toHaveLength(1)
      expect(result.content.match(/import \{ site \}/g)).toHaveLength(1)
      expect(result.content.match(/export const revalidate/g)).toHaveLength(1)
    }
  })

  it("does not duplicate preserved ESM when parsed export metadata is empty", () => {
    const source =
      'import { site } from "./config"\n\nexport const metadata = {}\nexport const revalidate = 3600\n\n# Body\n'
    const parsed = parseContentFile(source, "docs/a.mdx")

    const result = serializePublishContent({
      filePath: "docs/a.mdx",
      body: parsed.body,
      frontmatter: {},
      metadataSource: parsed.metadataSource,
      existingContent: source,
    })

    expect(result).toEqual({
      ok: true,
      content:
        'export const metadata = {}\n\nimport { site } from "./config"\n\nexport const revalidate = 3600\n\n# Body\n',
    })
  })

  it.each([
    "// keep",
    "/* keep */",
  ])("round-trips an empty metadata export without losing or duplicating its trailing comment: %s", (comment) => {
    const source = `export const metadata = {} ${comment}\n\n# Body\n`
    const parsed = parseContentFile(source, "docs/a.mdx")

    expect(
      serializePublishContent({
        filePath: "docs/a.mdx",
        body: parsed.body,
        frontmatter: {},
        metadataSource: parsed.metadataSource,
        existingContent: source,
      }),
    ).toEqual({ ok: true, content: source })
  })

  it("round-trips a next-line comment with its original CRLF separator", () => {
    const source = "\uFEFFexport const metadata = {}\r\n// keep\r\n# Body\r\n"
    const parsed = parseContentFile(source, "docs/a.mdx")

    expect(
      serializePublishContent({
        filePath: "docs/a.mdx",
        body: parsed.body,
        frontmatter: {},
        metadataSource: parsed.metadataSource,
        existingContent: source,
      }),
    ).toEqual({ ok: true, content: source })
  })

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

  it("restores the exact metadata export from the pinned source when the rich editor stripped it", () => {
    const existingContent =
      'export const metadata = {\n  title: "Original",\n  alternates: { canonical: "/hello" },\n}\n\n# Old body\n'
    const result = serializePublishContent({
      filePath: "docs/a.mdx",
      body: "# Body edited in the rich editor\n",
      frontmatter: {},
      metadataSource: "metadata-export",
      existingContent,
    })

    expect(result).toEqual({
      ok: true,
      content:
        'export const metadata = {\n  title: "Original",\n  alternates: { canonical: "/hello" },\n}\n\n# Body edited in the rich editor\n',
    })
  })

  it("preserves metadata declarations split before the name or assignment", () => {
    for (const metadataExport of [
      'export const\n  metadata = { title: "Original" }',
      'export const metadata\n  = { title: "Original" }',
    ]) {
      const result = serializePublishContent({
        filePath: "docs/a.mdx",
        body: "# Edited\n",
        frontmatter: {},
        metadataSource: "metadata-export",
        existingContent: `${metadataExport}\n\n# Old\n`,
      })

      expect(result).toEqual({
        ok: true,
        content: `${metadataExport}\n\n# Edited\n`,
      })
    }
  })

  it("preserves standalone and trailing line comments inside metadata objects", () => {
    for (const metadataExport of [
      'export const metadata = {\n  // SEO title\n  title: "Original",\n}',
      'export const metadata = {\n  title: "Original", // SEO title\n  description: "Description",\n}',
    ]) {
      const result = serializePublishContent({
        filePath: "docs/a.mdx",
        body: "# Edited\n",
        frontmatter: {},
        metadataSource: "metadata-export",
        existingContent: `${metadataExport}\n\n# Old\n`,
      })

      expect(result).toEqual({
        ok: true,
        content: `${metadataExport}\n\n# Edited\n`,
      })
    }
  })

  it("does not confuse structural type braces with the metadata initializer", () => {
    for (const metadataExport of [
      'export const metadata: { title: string }\n  = { title: "Original" }',
      'export const metadata: Readonly<{ title: string }> =\n  { title: "Original" }',
    ]) {
      const result = serializePublishContent({
        filePath: "docs/a.mdx",
        body: "# Edited\n",
        frontmatter: {},
        metadataSource: "metadata-export",
        existingContent: `${metadataExport}\n\n# Old\n`,
      })

      expect(result).toEqual({
        ok: true,
        content: `${metadataExport}\n\n# Edited\n`,
      })
    }
  })

  it("fails closed when stripped metadata cannot be recovered from the pinned source", () => {
    const result = serializePublishContent({
      filePath: "docs/a.mdx",
      body: "# Body edited in the rich editor\n",
      frontmatter: {},
      metadataSource: "metadata-export",
    })

    expect(result).toEqual({
      ok: false,
      reason: expect.stringMatching(/recover.*metadata export/i),
    })
  })

  it("recovers CRLF metadata exports containing braces and semicolons inside quoted strings", () => {
    const existingContent =
      'import type { Metadata } from "next"\r\n\r\nexport const metadata = {\r\n  title: "A }; still metadata",\r\n} satisfies Metadata\r\n\r\n# Old\r\n'
    const result = serializePublishContent({
      filePath: "docs/a.mdx",
      body: "# Edited\n",
      frontmatter: {},
      metadataSource: "metadata-export",
      existingContent,
    })

    expect(result).toEqual({
      ok: true,
      content:
        'import type { Metadata } from "next"\r\n\r\nexport const metadata = {\r\n  title: "A }; still metadata",\r\n} satisfies Metadata\n\n# Edited\n',
    })
  })

  it("fails closed on template-literal metadata instead of guessing its declaration boundary", () => {
    const result = serializePublishContent({
      filePath: "docs/a.mdx",
      body: "# Edited\n",
      frontmatter: {},
      metadataSource: "metadata-export",
      existingContent: "export const metadata = { title: `Hello " + "$" + "{name}` }\n\n# Old\n",
    })

    expect(result.ok).toBe(false)
  })

  it("fails closed on multiline conditional and chained-call initializers instead of truncating them", () => {
    for (const existingContent of [
      'export const metadata = condition\n  ? { title: "A" }\n  : { title: "B" }\n\n# Old\n',
      'export const metadata = defineMetadata\n  ({ title: "A" })\n  .withDefaults()\n\n# Old\n',
    ]) {
      const result = serializePublishContent({
        filePath: "docs/a.mdx",
        body: "# Edited\n",
        frontmatter: {},
        metadataSource: "metadata-export",
        existingContent,
      })
      expect(result.ok).toBe(false)
    }
  })

  it("fails closed on continuations after a balanced object literal", () => {
    for (const continuation of [
      ".withDefaults()",
      "[key]",
      "({ fallback: true })",
      "+ value",
      "| value",
      "< value",
      "in value",
      "instanceof Type",
      "as Metadata",
      "satisfies Metadata",
    ]) {
      const result = serializePublishContent({
        filePath: "docs/a.mdx",
        body: "# Edited\n",
        frontmatter: {},
        metadataSource: "metadata-export",
        existingContent: `export const metadata = { title: "A" }\n${continuation}\n\n# Old\n`,
      })
      expect(result.ok).toBe(false)
    }
  })

  it("does not treat punctuation at the start of a separate Markdown block as a JavaScript continuation", () => {
    for (const body of [
      "- list item\n",
      "* list item\n",
      "[link](https://example.com)\n",
      "<Callout>Body</Callout>\n",
      "![image](/image.png)\n",
      "---\n",
    ]) {
      const result = serializePublishContent({
        filePath: "docs/a.mdx",
        body: "# Edited\n",
        frontmatter: {},
        metadataSource: "metadata-export",
        existingContent: `export const metadata = { title: "A" }\n\n${body}`,
      })

      expect(result).toEqual({
        ok: true,
        content: 'export const metadata = { title: "A" }\n\n# Edited\n',
      })
    }
  })

  it("preserves the complete leading ESM preamble on both sides of metadata", () => {
    const existingContent =
      'import { site } from "./config"\n\nexport const metadata = { title: site.name }\nexport const revalidate = 3600\n\n# Old\n'
    const result = serializePublishContent({
      filePath: "docs/a.mdx",
      body: "# Edited\n",
      frontmatter: {},
      metadataSource: "metadata-export",
      existingContent,
    })

    expect(result).toEqual({
      ok: true,
      content:
        'import { site } from "./config"\n\nexport const metadata = { title: site.name }\nexport const revalidate = 3600\n\n# Edited\n',
    })
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
