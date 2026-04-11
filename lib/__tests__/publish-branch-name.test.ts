import { describe, expect, it } from "vitest"
import { buildPublishBranchName, derivePublishBranchScope } from "../publish-branch-name"

describe("derivePublishBranchScope", () => {
  it("uses the changed file slug when only one file changed", () => {
    expect(derivePublishBranchScope(["content/posts/hello-world.mdx"], "content")).toBe("hello-world")
  })

  it("uses the shared area label when multiple files changed in one area", () => {
    expect(
      derivePublishBranchScope(["content/posts/hello-world.mdx", "content/posts/another-post.mdx"], "content"),
    ).toBe("posts")
  })

  it("falls back to multi-change when changes span multiple areas", () => {
    expect(derivePublishBranchScope(["content/posts/hello-world.mdx", "public/images/blog/cover.png"], "content")).toBe(
      "multi-change",
    )
  })
})

describe("buildPublishBranchName", () => {
  it("builds the first branch name without an ordinal suffix", () => {
    expect(buildPublishBranchName("hello-world")).toBe("repopress/hello-world")
  })

  it("appends an ordinal suffix when a scope name collides", () => {
    expect(buildPublishBranchName("hello-world", 2)).toBe("repopress/hello-world-2")
  })
})
