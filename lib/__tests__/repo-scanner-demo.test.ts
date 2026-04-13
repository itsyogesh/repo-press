import { describe, expect, it } from "vitest"

import { buildRepoScannerDemo } from "../repo-scanner-demo"

describe("buildRepoScannerDemo", () => {
  it("extracts the owner and repo from a GitHub URL", () => {
    const result = buildRepoScannerDemo("https://github.com/acme/platform-docs")

    expect(result).toMatchObject({
      owner: "acme",
      repo: "platform-docs",
    })
  })

  it("normalizes trailing .git and slash suffixes", () => {
    const result = buildRepoScannerDemo("https://github.com/acme/content-hub.git/")

    expect(result).toMatchObject({
      owner: "acme",
      repo: "content-hub",
    })
  })

  it("uses the docs-site scenario for docs-heavy repositories", () => {
    const result = buildRepoScannerDemo("https://github.com/acme/docs")

    expect(result).toMatchObject({
      framework: "Fumadocs",
      contentRoot: "docs",
      collections: 6,
    })
  })

  it("returns a friendly validation error for non-GitHub input", () => {
    expect(buildRepoScannerDemo("https://example.com/not-github")).toEqual({
      error: "Only GitHub repositories are supported right now.",
    })
  })

  it("returns a hint for bare owner/repo slugs", () => {
    expect(buildRepoScannerDemo("acme/docs")).toEqual({
      error: "Add the full URL — try: https://github.com/owner/repo",
    })
  })

  it("returns a hint for GitHub tree/blob URLs", () => {
    expect(buildRepoScannerDemo("https://github.com/acme/docs/tree/main")).toEqual({
      error: "Paste the repository root — remove everything after the repo name.",
    })
  })
})
