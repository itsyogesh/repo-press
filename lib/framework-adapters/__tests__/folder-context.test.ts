import { describe, it, expect } from "vitest"
import { getFolderContext } from "../folder-context"
import type { FrameworkAdapter } from "../types"

// Minimal adapter stubs
const baseAdapter: FrameworkAdapter = {
  id: "custom",
  displayName: "Custom",
  detect: () => ({ score: 0, contentType: "custom" }),
  defaultContentRoots: [],
  fields: [
    {
      name: "title",
      type: "string",
      required: true,
      description: "Title",
      semanticRole: "title",
    },
    {
      name: "draft",
      type: "boolean",
      required: false,
      description: "Draft",
      semanticRole: "draft",
    },
    {
      name: "description",
      type: "string",
      required: false,
      description: "Description",
    },
  ],
  fieldVariants: {},
  metaFilePattern: null,
}

const adapterWithDate: FrameworkAdapter = {
  ...baseAdapter,
  id: "hugo",
  fields: [
    {
      name: "title",
      type: "string",
      required: true,
      description: "Title",
      semanticRole: "title",
    },
    {
      name: "draft",
      type: "boolean",
      required: false,
      description: "Draft",
      semanticRole: "draft",
    },
    {
      name: "date",
      type: "date",
      required: true,
      description: "Date",
      semanticRole: "date",
    },
  ],
  namingStrategy: "index-if-empty",
  fileExtension: ".md",
}

describe("getFolderContext", () => {
  it("matches blog keywords", () => {
    const ctx = getFolderContext("content/blog", baseAdapter)
    expect(ctx.contentLabel).toBe("Blog Post")
    expect(ctx.primaryFieldLabel).toBe("Post Title")
  })

  it("matches 'posts' keyword", () => {
    const ctx = getFolderContext("content/posts", baseAdapter)
    expect(ctx.contentLabel).toBe("Blog Post")
  })

  it("matches docs keywords", () => {
    const ctx = getFolderContext("docs", baseAdapter)
    expect(ctx.contentLabel).toBe("Doc Page")
    expect(ctx.primaryFieldLabel).toBe("Page Name")
  })

  it("matches author keywords", () => {
    const ctx = getFolderContext("data/authors", baseAdapter)
    expect(ctx.contentLabel).toBe("Author")
    expect(ctx.primaryFieldLabel).toBe("Full Name")
  })

  it("matches changelog keywords", () => {
    const ctx = getFolderContext("content/changelog", baseAdapter)
    expect(ctx.contentLabel).toBe("Release Note")
    expect(ctx.primaryFieldLabel).toBe("Release Title")
  })

  it("returns 'New Page' for empty path (root)", () => {
    const ctx = getFolderContext("", baseAdapter)
    expect(ctx.contentLabel).toBe("New Page")
    expect(ctx.primaryFieldLabel).toBe("Page Title")
  })

  it("falls back to title-cased folder name for unknown segment", () => {
    const ctx = getFolderContext("content/recipes", baseAdapter)
    expect(ctx.contentLabel).toBe("Recipes File")
    expect(ctx.primaryFieldLabel).toBe("Title")
  })

  it("picks up namingStrategy and fileExtension from adapter", () => {
    const ctx = getFolderContext("content/blog", adapterWithDate)
    expect(ctx.namingStrategy).toBe("index-if-empty")
    expect(ctx.fileExtension).toBe(".md")
  })

  it("excludes title and draft from requiredFields, but includes date", () => {
    const ctx = getFolderContext("content/blog", adapterWithDate)
    expect(ctx.requiredFields.map((f) => f.name)).not.toContain("title")
    expect(ctx.requiredFields.map((f) => f.name)).not.toContain("draft")
    expect(ctx.requiredFields.map((f) => f.name)).toContain("date")
  })
})
