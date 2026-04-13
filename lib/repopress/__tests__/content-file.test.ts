import { describe, expect, it } from "vitest"
import {
  type ContentMetadataSource,
  extractTitleFromContentFile,
  parseContentFile,
  serializeContentFile,
} from "../content-file"

describe("parseContentFile", () => {
  it("parses frontmatter markdown files", () => {
    const parsed = parseContentFile(
      `---
title: Hello World
description: Intro post
---

# Hello`,
      "content/blog/hello.md",
    )

    expect(parsed.body).toBe("# Hello")
    expect(parsed.frontmatter).toEqual({
      title: "Hello World",
      description: "Intro post",
    })
    expect(parsed.metadataSource).toBe("frontmatter")
    expect(parsed.warnings).toEqual([])
  })

  it("parses mdx metadata exports as editable frontmatter data", () => {
    const parsed = parseContentFile(
      `export const metadata = {
  title: "Santa Letter Template Free",
  description: "A free printable template",
  tags: ["printable", "christmas"]
}

# Printable template`,
      "app/(main)/blog/santa-letter-template-free/page.mdx",
    )

    expect(parsed.body).toBe("# Printable template")
    expect(parsed.frontmatter).toEqual({
      title: "Santa Letter Template Free",
      description: "A free printable template",
      tags: ["printable", "christmas"],
    })
    expect(parsed.metadataSource).toBe("metadata-export")
    expect(parsed.warnings).toEqual([])
  })

  it("prefers metadata exports over yaml when both exist", () => {
    const parsed = parseContentFile(
      `---
title: Wrong title
---

export const metadata = {
  title: "Correct title"
}

# Hello`,
      "app/blog/hello/page.mdx",
    )

    expect(parsed.body).toBe("# Hello")
    expect(parsed.frontmatter).toEqual({ title: "Correct title" })
    expect(parsed.metadataSource).toBe("metadata-export")
    expect(parsed.warnings).toEqual([
      "Both YAML frontmatter and export const metadata were found. Using metadata export.",
    ])
  })
})

describe("serializeContentFile", () => {
  it("serializes frontmatter files back to yaml", () => {
    const content = serializeContentFile({
      filePath: "content/blog/hello.md",
      body: "# Hello",
      frontmatter: { title: "Hello World", description: "Intro post" },
      metadataSource: "frontmatter",
      metadataDefault: "frontmatter",
    })

    expect(content).toBe(`---
title: Hello World
description: Intro post
---
# Hello
`)
  })

  it("serializes metadata-export files back to mdx metadata exports", () => {
    const content = serializeContentFile({
      filePath: "app/blog/hello/page.mdx",
      body: "# Hello",
      frontmatter: { title: "Hello World", description: "Intro post" },
      metadataSource: "metadata-export",
      metadataDefault: "metadata-export",
    })

    expect(content).toBe(`export const metadata = {
  "title": "Hello World",
  "description": "Intro post"
}

# Hello`)
  })

  it("uses the project default when creating metadata for files without an existing metadata source", () => {
    const content = serializeContentFile({
      filePath: "app/blog/hello/page.mdx",
      body: "# Hello",
      frontmatter: { title: "Hello World" },
      metadataSource: "none" as ContentMetadataSource,
      metadataDefault: "metadata-export",
    })

    expect(content).toBe(`export const metadata = {
  "title": "Hello World"
}

# Hello`)
  })
})

describe("extractTitleFromContentFile", () => {
  it("extracts title from mdx metadata exports", () => {
    const title = extractTitleFromContentFile(
      `export const metadata = {
  title: "Template title"
}

# Hello`,
      "app/blog/hello/page.mdx",
    )

    expect(title).toBe("Template title")
  })
})
