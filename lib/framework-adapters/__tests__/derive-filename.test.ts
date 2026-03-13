import { describe, it, expect } from "vitest"
import { deriveFilename } from "../derive-filename"

describe("deriveFilename – slug strategy", () => {
  it("returns slug + extension for a simple title", () => {
    expect(
      deriveFilename({
        title: "Hello World",
        strategy: "slug",
        extension: ".mdx",
        existingNames: [],
      }),
    ).toBe("hello-world.mdx")
  })

  it("appends -2 when the slug already exists", () => {
    expect(
      deriveFilename({
        title: "Hello World",
        strategy: "slug",
        extension: ".mdx",
        existingNames: ["hello-world.mdx"],
      }),
    ).toBe("hello-world-2.mdx")
  })

  it("increments suffix until free (-2, -3)", () => {
    expect(
      deriveFilename({
        title: "Hello World",
        strategy: "slug",
        extension: ".mdx",
        existingNames: ["hello-world.mdx", "hello-world-2.mdx"],
      }),
    ).toBe("hello-world-3.mdx")
  })
})

describe("deriveFilename – index-if-empty strategy", () => {
  it("returns slug/index.mdx when folder is empty", () => {
    expect(
      deriveFilename({
        title: "My Doc",
        strategy: "index-if-empty",
        extension: ".mdx",
        existingNames: [],
      }),
    ).toBe("my-doc/index.mdx")
  })

  it("returns slug.mdx when folder has children", () => {
    expect(
      deriveFilename({
        title: "My Doc",
        strategy: "index-if-empty",
        extension: ".mdx",
        existingNames: ["existing.mdx"],
      }),
    ).toBe("my-doc.mdx")
  })

  it("falls back to flat file when folder has children, with conflict resolution", () => {
    // existingNames non-empty → flat file form; "my-doc.mdx" also taken → my-doc-2.mdx
    expect(
      deriveFilename({
        title: "My Doc",
        strategy: "index-if-empty",
        extension: ".mdx",
        existingNames: ["existing.mdx", "my-doc.mdx"],
      }),
    ).toBe("my-doc-2.mdx")
  })
})

describe("deriveFilename – date-slug strategy", () => {
  it("prefixes with today's date by default", () => {
    const result = deriveFilename({
      title: "My Post",
      strategy: "date-slug",
      extension: ".md",
      existingNames: [],
    })
    const today = new Date()
    const datePrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    expect(result).toBe(`${datePrefix}-my-post.md`)
  })

  it("accepts a custom date", () => {
    expect(
      deriveFilename({
        title: "Release",
        strategy: "date-slug",
        extension: ".md",
        existingNames: [],
        date: new Date("2026-03-13"),
      }),
    ).toBe("2026-03-13-release.md")
  })

  it("applies conflict resolution for date-slug", () => {
    expect(
      deriveFilename({
        title: "Release",
        strategy: "date-slug",
        extension: ".md",
        existingNames: ["2026-03-13-release.md"],
        date: new Date("2026-03-13"),
      }),
    ).toBe("2026-03-13-release-2.md")
  })
})
