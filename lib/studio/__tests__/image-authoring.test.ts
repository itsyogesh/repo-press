import { describe, expect, it } from "vitest"

import { getAuthoredImageValue } from "../image-authoring"

describe("image authoring values", () => {
  const repoPath = "/public/images/blog/creative-domain-ideas/creative-domain-ideas.png"
  const selectedFilePath = "content/blog/creative-domain-ideas.mdx"

  it("stores bare filenames for blog cover images in frontmatter", () => {
    expect(
      getAuthoredImageValue({
        repoPath,
        selectedFilePath,
        usage: "frontmatter",
        fieldName: "image",
        semanticRole: "image",
      }),
    ).toBe("creative-domain-ideas.png")
  })

  it("stores public asset paths for component images", () => {
    expect(
      getAuthoredImageValue({
        repoPath,
        selectedFilePath,
        usage: "component",
      }),
    ).toBe("/images/blog/creative-domain-ideas/creative-domain-ideas.png")
  })

  it("keeps public asset paths for social image frontmatter fields", () => {
    expect(
      getAuthoredImageValue({
        repoPath,
        selectedFilePath,
        usage: "frontmatter",
        fieldName: "ogImage",
        semanticRole: "ogImage",
      }),
    ).toBe("/images/blog/creative-domain-ideas/creative-domain-ideas.png")
  })
})
