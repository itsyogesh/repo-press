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
      contentRoot: "apps/docs/content/docs",
      collections: 6,
    })
  })

  it("returns a friendly validation error for non-GitHub input", () => {
    expect(buildRepoScannerDemo("https://example.com/not-github")).toEqual({
      error: "Enter a valid GitHub repository URL.",
    })
  })
})
