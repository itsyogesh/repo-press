import matter from "gray-matter"
import { describe, expect, it } from "vitest"
import { parseContentFile } from "@/lib/content-metadata"

function expectUnsupportedFrontmatter(source: string) {
  expect(parseContentFile(source, "docs/a.md")).toEqual({
    body: source,
    metadata: {},
    metadataSource: "frontmatter",
    editable: false,
    diagnostic: "UNSUPPORTED_FRONTMATTER",
  })
}

describe("parseContentFile", () => {
  it("parses a static Merry-style metadata export without evaluating it", () => {
    const source = `export const metadata = {
  title: "Free Printable Santa Letter Templates",
  description: "Ready-to-print templates",
  keywords: ["Santa", "letters"],
  alternates: { canonical: "https://merrymagicmail.com/blog/templates" },
}

# Free Santa Letter Templates
`

    const result = parseContentFile(source, "blog/templates/page.mdx")

    expect(result).toEqual({
      body: "# Free Santa Letter Templates\n",
      metadata: {
        title: "Free Printable Santa Letter Templates",
        description: "Ready-to-print templates",
        keywords: ["Santa", "letters"],
        alternates: { canonical: "https://merrymagicmail.com/blog/templates" },
      },
      metadataSource: "metadata-export",
      editable: true,
    })
    expect(Object.isFrozen(result.metadata)).toBe(true)
    expect(Object.isFrozen(result.metadata.alternates)).toBe(true)
  })

  it("continues to parse YAML frontmatter", () => {
    const result = parseContentFile("---\ntitle: Hello\ntags:\n  - docs\n---\n\n# Body\n", "docs/a.md")

    expect(result).toEqual({
      body: "\n# Body\n",
      metadata: { title: "Hello", tags: ["docs"] },
      metadataSource: "frontmatter",
      editable: true,
    })
    expect(Object.isFrozen(result.metadata)).toBe(true)
  })

  it("handles BOMs, CRLF, leading comments and imports, quoted keys, and negative numbers", () => {
    const source =
      '\uFEFF// Page metadata\r\nimport type { Metadata } from "next"\r\n\r\nexport const metadata = {\r\n  "title": "Hello",\r\n  count: -2.5,\r\n  enabled: true,\r\n  optional: null,\r\n}\r\n\r\n# Body\r\n'

    expect(parseContentFile(source, "docs/a.mdx")).toEqual({
      body: '// Page metadata\r\nimport type { Metadata } from "next"\r\n\r\n\r\n# Body\r\n',
      metadata: { title: "Hello", count: -2.5, enabled: true, optional: null },
      metadataSource: "metadata-export",
      editable: true,
    })
  })

  it("removes only metadata while preserving unrelated leading ESM and comments byte-for-byte", () => {
    const source =
      '/* keep */\nimport { site } from "./config"\n\nexport const metadata = { title: "Hello" }\nexport const revalidate = 3600\n\n# Body\n'

    expect(parseContentFile(source, "docs/a.mdx")).toEqual({
      body: '/* keep */\nimport { site } from "./config"\n\nexport const revalidate = 3600\n\n# Body\n',
      metadata: { title: "Hello" },
      metadataSource: "metadata-export",
      editable: true,
    })
  })

  it.each([
    [
      "a next-line line comment with BOM and CRLF",
      '\uFEFFexport const metadata = { title: "Hello" }\r\n// keep\r\n# Body\r\n',
      "// keep\r\n# Body\r\n",
    ],
    [
      "an inline trailing line comment",
      'export const metadata = { title: "Hello" } // keep\n\n# Body\n',
      " // keep\n\n# Body\n",
    ],
    [
      "an inline trailing block comment",
      'export const metadata = { title: "Hello" } /* keep */\n\n# Body\n',
      " /* keep */\n\n# Body\n",
    ],
  ])("preserves %s outside the metadata removal span", (_name, source, body) => {
    expect(parseContentFile(source, "docs/a.mdx")).toEqual({
      body,
      metadata: { title: "Hello" },
      metadataSource: "metadata-export",
      editable: true,
    })
  })

  it("fails closed when comment trivia is followed by a real expression continuation", () => {
    const source = 'export const metadata = { title: "Hello" }\n// keep\n/* still trivia */\n.withDefaults()\n# Body\n'

    expect(parseContentFile(source, "docs/a.mdx")).toEqual({
      body: source,
      metadata: {},
      metadataSource: "metadata-export",
      editable: false,
      diagnostic: "UNSUPPORTED_METADATA_EXPORT",
    })
  })

  it.each([
    ["plain Markdown", "# Body\n", "docs/a.md"],
    ["plain MDX", "# Body\n", "docs/a.mdx"],
    ["metadata-like JavaScript in Markdown", 'export const metadata = { title: "Hi" }\n', "docs/a.md"],
    ["a fenced metadata example", '```ts\nexport const metadata = { title: "Hi" }\n```\n', "docs/a.mdx"],
  ])("returns editable content with no metadata for %s", (_name, source, filePath) => {
    expect(parseContentFile(source, filePath)).toEqual({
      body: source,
      metadata: {},
      metadataSource: "none",
      editable: true,
    })
  })

  it.each([
    ["calls", "export const metadata = { title: makeTitle() }\n\n# Body\n"],
    ["identifiers", "export const metadata = { title: site.name }\n\n# Body\n"],
    ["array spreads", "export const metadata = { tags: [...defaults] }\n\n# Body\n"],
    ["object spreads", "export const metadata = { ...defaults }\n\n# Body\n"],
    ["computed keys", 'export const metadata = { ["title"]: "Hi" }\n\n# Body\n'],
    ["methods", 'export const metadata = { title() { return "Hi" } }\n\n# Body\n'],
    ["getters", 'export const metadata = { get title() { return "Hi" } }\n\n# Body\n'],
    ["regular expressions", "export const metadata = { matcher: /docs/i }\n\n# Body\n"],
    ["template expressions", "export const metadata = { title: `Hello $" + "{name}` }\n\n# Body\n"],
    ["bigints", "export const metadata = { count: 1n }\n\n# Body\n"],
    ["dangerous __proto__ keys", "export const metadata = { __proto__: { polluted: true } }\n\n# Body\n"],
    ["dangerous constructor keys", 'export const metadata = { constructor: "nope" }\n\n# Body\n'],
    ["dangerous prototype keys", 'export const metadata = { prototype: "nope" }\n\n# Body\n'],
  ])("preserves the exact source and disables editing for unsupported %s", (_name, source) => {
    expect(parseContentFile(source, "docs/a.mdx")).toEqual({
      body: source,
      metadata: {},
      metadataSource: "metadata-export",
      editable: false,
      diagnostic: "UNSUPPORTED_METADATA_EXPORT",
    })
  })

  it.each([
    ".withDefaults()",
    "[key]",
    "+ fallback",
    "| fallback",
    "instanceof Metadata",
  ])("preserves the exact source and disables editing for a balanced-object continuation: %s", (continuation) => {
    const source = `export const metadata = { title: "A" }\n${continuation}\n# Body\n`

    expect(parseContentFile(source, "docs/a.mdx")).toEqual({
      body: source,
      metadata: {},
      metadataSource: "metadata-export",
      editable: false,
      diagnostic: "UNSUPPORTED_METADATA_EXPORT",
    })
  })

  it.each([
    ["non-breaking space", "\u00A0", ".withDefaults()"],
    ["form feed", "\u000C", ".withDefaults()"],
    ["vertical tab", "\u000B", "+ fallback"],
  ])("rejects a continuation preceded by %s", (_name, whitespace, continuation) => {
    const source = `export const metadata = { title: "A" }\n${whitespace}${continuation}\n# Body\n`

    expect(parseContentFile(source, "docs/a.mdx")).toEqual({
      body: source,
      metadata: {},
      metadataSource: "metadata-export",
      editable: false,
      diagnostic: "UNSUPPORTED_METADATA_EXPORT",
    })
  })

  it("rejects metadata that exceeds structural and literal budgets", () => {
    const tooDeep = `${"{ value: ".repeat(40)}"end"${" }".repeat(40)}`
    const tooManyKeys = `{ ${Array.from({ length: 300 }, (_, index) => `key${index}: ${index}`).join(", ")} }`
    const tooManyArrayItems = `[${Array.from({ length: 1100 }, (_, index) => index).join(",")}]`
    const oversizedString = JSON.stringify("x".repeat(70_000))

    for (const initializer of [
      tooDeep,
      tooManyKeys,
      `{ items: ${tooManyArrayItems} }`,
      `{ title: ${oversizedString} }`,
    ]) {
      const source = `export const metadata = ${initializer}\n\n# Body\n`
      expect(parseContentFile(source, "docs/a.mdx")).toEqual({
        body: source,
        metadata: {},
        metadataSource: "metadata-export",
        editable: false,
        diagnostic: "UNSUPPORTED_METADATA_EXPORT",
      })
    }
  })

  it("rejects oversized metadata declarations and excessive lexical nesting before parsing", () => {
    for (const initializer of [
      `{ /* ${"x".repeat(70_000)} */ title: "A" }`,
      `${"({ value: ".repeat(180)}"end"${" })".repeat(180)}`,
    ]) {
      const source = `export const metadata = ${initializer}\n\n# Body\n`
      expect(parseContentFile(source, "docs/a.mdx")).toEqual({
        body: source,
        metadata: {},
        metadataSource: "metadata-export",
        editable: false,
        diagnostic: "UNSUPPORTED_METADATA_EXPORT",
      })
    }
  })

  it.each([
    ["malformed YAML", "---\ntitle: [unterminated\n---\n# Body\n"],
    ["cyclic aliases", "---\nroot: &root\n  self: *root\n---\n# Body\n"],
    ["a scalar root", "---\njust a scalar\n---\n# Body\n"],
    ["dangerous keys", "---\n__proto__:\n  polluted: true\n---\n# Body\n"],
    ["date values", "---\npublishedAt: 2025-12-25\n---\n# Body\n"],
  ])("fails closed and preserves source for unsupported frontmatter containing %s", (_name, source) => {
    expectUnsupportedFrontmatter(source)
  })

  it("bounds YAML depth, keys, arrays, and strings", () => {
    const deepLines = ["---", "root:"]
    for (let depth = 0; depth < 40; depth += 1) deepLines.push(`${"  ".repeat(depth + 1)}level${depth}:`)
    deepLines.push(`${"  ".repeat(41)}value`)
    deepLines.push("---", "# Body")

    const tooManyKeys = `---\n${Array.from({ length: 300 }, (_, index) => `key${index}: ${index}`).join("\n")}\n---\n# Body\n`
    const tooManyItems = `---\nitems: [${Array.from({ length: 1100 }, (_, index) => index).join(",")}]\n---\n# Body\n`
    const oversizedString = `---\ntitle: ${"x".repeat(70_000)}\n---\n# Body\n`

    for (const source of [`${deepLines.join("\n")}\n`, tooManyKeys, tooManyItems, oversizedString]) {
      expectUnsupportedFrontmatter(source)
    }
  })

  it("clones non-cyclic YAML aliases without freezing gray-matter cache values", () => {
    const source = "---\ndefaults: &defaults\n  label: Shared\nleft: *defaults\nright: *defaults\n---\n# Body\n"
    const grayMatter = matter as typeof matter & { clearCache: () => void }
    grayMatter.clearCache()

    const first = parseContentFile(source, "docs/a.md")
    const direct = matter(source)
    const second = parseContentFile(source, "docs/a.md")

    expect(first.metadata).toEqual({
      defaults: { label: "Shared" },
      left: { label: "Shared" },
      right: { label: "Shared" },
    })
    expect(first.metadata.left).not.toBe(first.metadata.right)
    expect(Object.isFrozen(direct.data)).toBe(false)
    expect(Object.isFrozen(direct.data.defaults)).toBe(false)
    expect(second.metadata).toEqual(first.metadata)
    grayMatter.clearCache()
  })

  it("does not execute repository code while rejecting dynamic metadata", () => {
    delete (globalThis as { __metadataParserExecuted?: boolean }).__metadataParserExecuted
    const source =
      "export const metadata = { title: (() => { globalThis.__metadataParserExecuted = true; return 'bad' })() }\n\n# Body\n"

    const result = parseContentFile(source, "docs/a.mdx")

    expect((globalThis as { __metadataParserExecuted?: boolean }).__metadataParserExecuted).toBeUndefined()
    expect(result.editable).toBe(false)
    expect(result.body).toBe(source)
  })

  it.each([
    [
      "in the leading preamble",
      'export const metadata = { title: "First" }\nexport const metadata = { title: "Second" }\n\n# Body\n',
    ],
    [
      "later in the body",
      'export const metadata = { title: "First" }\n\n# Body\n\nexport const metadata = { title: "Second" }\n',
    ],
  ])("rejects a second metadata declaration %s", (_name, source) => {
    expect(parseContentFile(source, "docs/a.mdx")).toEqual({
      body: source,
      metadata: {},
      metadataSource: "metadata-export",
      editable: false,
      diagnostic: "UNSUPPORTED_METADATA_EXPORT",
    })
  })
})
