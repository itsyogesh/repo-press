import { describe, expect, it } from "vitest"
import { prepareTitleSyncFiles, resolveStudioCreatePaths, treePathToContentPath } from "../path-adapters"

describe("Studio path adapters", () => {
  it("converts a selected repository tree path to canonical document storage", () => {
    expect(treePathToContentPath("content/docs", "content/docs/guides/start.mdx")).toBe("guides/start.mdx")
  })

  it("builds root and nested create paths with separate repository and storage representations", () => {
    expect(resolveStudioCreatePaths("content/docs", "", "start.mdx")).toEqual({
      repoPath: "content/docs/start.mdx",
      contentPath: "start.mdx",
    })
    expect(resolveStudioCreatePaths("content/docs", "content/docs/guides", "start.mdx")).toEqual({
      repoPath: "content/docs/guides/start.mdx",
      contentPath: "guides/start.mdx",
    })
  })

  it("rejects create parents outside the configured content root", () => {
    expect(() => resolveStudioCreatePaths("content/docs", "content/other", "start.mdx")).toThrow("outside content root")
  })

  it("adapts GitHub title-sync inputs without losing their repository fetch path", () => {
    expect(
      prepareTitleSyncFiles("content/docs", [{ path: "content/docs/guides/cafe\u0301.mdx", sha: "sha-1" }]),
    ).toEqual([
      {
        path: "guides/café.mdx",
        repoPath: "content/docs/guides/café.mdx",
        sha: "sha-1",
      },
    ])
  })
})
