import { describe, expect, it } from "vitest"
import {
  assertContentPath,
  normalizeContentRoot,
  resolveStoredRepoPath,
  toContentPath,
  toRepoPath,
  toRepoPathFromLegacyRepoPath,
} from "../path-policy"

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

  it("does not guess whether a same-prefix canonical path is a legacy repository path", () => {
    expect(toRepoPath("content/docs", "content/docs/guide/start.mdx")).toBe("content/docs/content/docs/guide/start.mdx")
    expect(toRepoPath("content", "content-old/guide.mdx")).toBe("content/content-old/guide.mdx")
  })

  it("supports legacy repository-relative values only through an explicit conversion", () => {
    expect(toRepoPathFromLegacyRepoPath("content/docs", "content/docs/guide/start.mdx")).toBe(
      "content/docs/guide/start.mdx",
    )
    expect(() => toRepoPathFromLegacyRepoPath("content/docs", "content/docs-old/guide.mdx")).toThrow(
      "outside content root",
    )
    expect(() => toRepoPathFromLegacyRepoPath("content/docs", "content/docs")).toThrow("document file")
  })

  it("resolves stored paths only from their explicit representation tag", () => {
    expect(resolveStoredRepoPath("content/docs", "guides/start.mdx", "content_relative_v1")).toBe(
      "content/docs/guides/start.mdx",
    )
    expect(resolveStoredRepoPath("content/docs", "content/docs/guides/start.mdx", "legacy_repo_v0")).toBe(
      "content/docs/guides/start.mdx",
    )
    expect(resolveStoredRepoPath("content/docs", "content/docs/guides/start.mdx")).toBe("content/docs/guides/start.mdx")
    expect(resolveStoredRepoPath("content/docs", "content/docs/guides/start.mdx", "content_relative_v1")).toBe(
      "content/docs/content/docs/guides/start.mdx",
    )
  })

  it("rejects unknown stored path representation tags", () => {
    expect(() => resolveStoredRepoPath("content/docs", "guides/start.mdx", "guessed" as never)).toThrow(
      "unknown path representation",
    )
  })

  it.each([
    ["empty", ""],
    ["absolute", "/guide/start.mdx"],
    ["backslash", "guide\\start.mdx"],
    ["NUL", "guide/sta\0rt.mdx"],
    ["control", "guide/sta\u001frt.mdx"],
    ["C1 control", "guide/sta\u0085rt.mdx"],
    ["left-to-right mark", "guide/sta\u200ert.mdx"],
    ["right-to-left override", "guide/sta\u202ert.mdx"],
    ["left-to-right isolate", "guide/sta\u2066rt.mdx"],
    ["Arabic letter mark", "guide/sta\u061crt.mdx"],
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
    "content/\u200fdocs",
    "content/\u202adocs",
    "content/\u2069docs",
    "content/\u061cdocs",
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

  it("normalizes accepted path and root segments to NFC", () => {
    expect(assertContentPath("guides/cafe\u0301.mdx")).toBe("guides/café.mdx")
    expect(normalizeContentRoot("conte\u0301nt/docs")).toBe("contént/docs")
    expect(toRepoPath("conte\u0301nt", "guides/cafe\u0301.mdx")).toBe("contént/guides/café.mdx")
  })

  it("rejects repository paths outside the exact content-root boundary", () => {
    expect(() => toContentPath("content/docs", "content/docs-old/guide.mdx")).toThrow("outside content root")
    expect(() => toContentPath("content/docs", "content/docs")).toThrow("document file")
    expect(() => toContentPath("content/docs", "other/guide.mdx")).toThrow("outside content root")
  })
})
