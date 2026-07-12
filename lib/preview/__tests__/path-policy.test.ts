import { describe, expect, it } from "vitest"
import { assertContentPath, normalizeContentRoot, toContentPath, toRepoPath } from "../path-policy"

describe("content path policy", () => {
  it("accepts safe content-relative file paths", () => {
    expect(assertContentPath("guide/start.mdx")).toBe("guide/start.mdx")
    expect(assertContentPath("start.mdx")).toBe("start.mdx")
  })

  it("allows an empty content root and validates nested roots", () => {
    expect(normalizeContentRoot("")).toBe("")
    expect(normalizeContentRoot("content/docs")).toBe("content/docs")
    expect(toRepoPath("", "guide/start.mdx")).toBe("guide/start.mdx")
    expect(toRepoPath("content/docs", "guide/start.mdx")).toBe("content/docs/guide/start.mdx")
  })

  it("preserves only exact legacy repository-relative prefixes", () => {
    expect(toRepoPath("content/docs", "content/docs/guide/start.mdx")).toBe("content/docs/guide/start.mdx")
    expect(toRepoPath("content", "content-old/guide.mdx")).toBe("content/content-old/guide.mdx")
    expect(() => toRepoPath("content/docs", "content/docs")).toThrow("document file")
  })

  it.each([
    ["empty", ""],
    ["absolute", "/guide/start.mdx"],
    ["backslash", "guide\\start.mdx"],
    ["NUL", "guide/sta\0rt.mdx"],
    ["control", "guide/sta\u001frt.mdx"],
    ["C1 control", "guide/sta\u0085rt.mdx"],
    ["dot segment", "guide/./start.mdx"],
    ["dot-dot segment", "guide/../start.mdx"],
    ["leading traversal", "../secrets.mdx"],
    ["duplicate slash", "guide//start.mdx"],
    ["trailing slash", "guide/start.mdx/"],
    ["URL", "https://example.com/start.mdx"],
    ["scheme", "file:guide/start.mdx"],
  ])("rejects an unsafe %s content path", (_label, path) => {
    expect(() => assertContentPath(path)).toThrowError(expect.objectContaining({ name: "PathPolicyError" }))
  })

  it.each([
    "/content/docs",
    "content\\docs",
    "content\0/docs",
    "content/\u007fdocs",
    "content/\u009fdocs",
    "content/./docs",
    "content/../docs",
    "content//docs",
    "content/docs/",
    "https://example.com/docs",
  ])("rejects an unsafe content root %s", (root) => {
    expect(() => normalizeContentRoot(root)).toThrowError(expect.objectContaining({ name: "PathPolicyError" }))
  })

  it("converts repository-relative paths back to content-relative paths", () => {
    expect(toContentPath("", "guide/start.mdx")).toBe("guide/start.mdx")
    expect(toContentPath("content/docs", "content/docs/guide/start.mdx")).toBe("guide/start.mdx")
  })

  it("rejects repository paths outside the exact content-root boundary", () => {
    expect(() => toContentPath("content/docs", "content/docs-old/guide.mdx")).toThrow("outside content root")
    expect(() => toContentPath("content/docs", "content/docs")).toThrow("document file")
    expect(() => toContentPath("content/docs", "other/guide.mdx")).toThrow("outside content root")
  })
})
