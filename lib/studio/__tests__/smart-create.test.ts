import { describe, expect, it } from "vitest"
import type { FrameworkAdapter } from "@/lib/framework-adapters/types"
import type { FileTreeNode } from "@/lib/github"
import { buildSiblingFields, findSiblingContentFile, resolveSmartCreateExtension } from "../smart-create"

const customAdapter: FrameworkAdapter = {
  id: "custom",
  displayName: "Custom",
  detect: () => ({ score: 1, contentType: "custom" }),
  defaultContentRoots: [],
  fields: [],
  fieldVariants: {},
  metaFilePattern: null,
}

describe("smart create helpers", () => {
  it("skips object-shaped sibling frontmatter fields", () => {
    const fields = buildSiblingFields({
      title: "Hello",
      description: "World",
      tags: ["news"],
      seo: { title: "SEO title" },
      authors: [{ name: "Alex" }],
      draft: false,
    })

    expect(fields.map((field) => field.name)).toEqual(["description", "tags"])
  })

  it("finds a sibling content file and skips index pages", () => {
    const nodes = [
      { type: "file", name: "index.mdx", path: "content/blog/index.mdx", sha: "a" },
      { type: "file", name: "post.md", path: "content/blog/post.md", sha: "b" },
    ] as FileTreeNode[]

    expect(findSiblingContentFile(nodes)?.path).toBe("content/blog/post.md")
  })

  it("inherits the sibling extension before falling back to adapter defaults", () => {
    const extension = resolveSmartCreateExtension({
      adapter: customAdapter,
      siblingPath: "content/blog/post.md",
    })

    expect(extension).toBe(".md")
  })

  it("defaults custom / unknown repos to markdown when no stronger signal exists", () => {
    const extension = resolveSmartCreateExtension({
      adapter: customAdapter,
    })

    expect(extension).toBe(".md")
  })
})
