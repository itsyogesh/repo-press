import { describe, expect, it } from "vitest"
import { extractTitleFromContent } from "../content-title"

describe("extractTitleFromContent", () => {
  it("reads title from YAML frontmatter", () => {
    expect(extractTitleFromContent(`---\ntitle: Hello World\n---\n# Body`, "blog/a.md")).toBe("Hello World")
  })

  it("reads quoted YAML title", () => {
    expect(extractTitleFromContent(`---\ntitle: "Quoted Title"\n---\n`, "blog/a.md")).toBe("Quoted Title")
  })

  it("reads title from an export const metadata block", () => {
    const src = `export const metadata = {\n  title: "From Export",\n  description: "x"\n}\n\n# Body`
    expect(extractTitleFromContent(src, "app/blog/page.mdx")).toBe("From Export")
  })

  it("falls back to the filename stem when no title exists", () => {
    expect(extractTitleFromContent(`# Just a heading`, "docs/getting-started.mdx")).toBe("getting-started")
  })

  it("falls back to the filename stem on empty content", () => {
    expect(extractTitleFromContent("", "content/my-post.markdown")).toBe("my-post")
  })
})
