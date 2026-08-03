import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockOctokit } = vi.hoisted(() => {
  return {
    mockOctokit: {
      repos: {
        getContent: vi.fn(),
      },
      git: {
        getBlob: vi.fn(),
      },
    },
  }
})

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function OctokitMock() {
    return mockOctokit
  }),
}))

import { GitHubReadError, getFileForPublish } from "../github"

describe("getFileForPublish", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a found file with decoded content and sha", async () => {
    mockOctokit.repos.getContent.mockResolvedValue({
      data: {
        content: Buffer.from("# Hello").toString("base64"),
        sha: "sha-1",
        name: "hello.md",
        path: "docs/hello.md",
      },
    })

    const result = await getFileForPublish("token", "acme", "docs-site", "docs/hello.md", "main")
    expect(result).toEqual({
      status: "found",
      file: { content: "# Hello", sha: "sha-1", name: "hello.md", path: "docs/hello.md" },
    })
  })

  it("treats 404 as absent", async () => {
    mockOctokit.repos.getContent.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }))

    const result = await getFileForPublish("token", "acme", "docs-site", "docs/missing.md", "main")
    expect(result).toEqual({ status: "absent" })
  })

  it("throws GitHubReadError on server errors instead of reporting absent", async () => {
    mockOctokit.repos.getContent.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }))

    await expect(getFileForPublish("token", "acme", "docs-site", "docs/hello.md", "main")).rejects.toBeInstanceOf(
      GitHubReadError,
    )
  })

  it("throws GitHubReadError on rate limiting", async () => {
    mockOctokit.repos.getContent.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 403 }))

    await expect(getFileForPublish("token", "acme", "docs-site", "docs/hello.md", "main")).rejects.toBeInstanceOf(
      GitHubReadError,
    )
  })

  it("throws GitHubReadError when the path resolves to a directory", async () => {
    mockOctokit.repos.getContent.mockResolvedValue({ data: [{ name: "child.md" }] })

    await expect(getFileForPublish("token", "acme", "docs-site", "docs", "main")).rejects.toBeInstanceOf(
      GitHubReadError,
    )
  })

  it("falls back to the blob API for large files missing inline content", async () => {
    mockOctokit.repos.getContent.mockResolvedValue({
      data: { content: "", sha: "blob-sha", name: "big.md", path: "docs/big.md" },
    })
    mockOctokit.git.getBlob.mockResolvedValue({
      data: { content: Buffer.from("# Big").toString("base64") },
    })

    const result = await getFileForPublish("token", "acme", "docs-site", "docs/big.md", "main")
    expect(result).toEqual({
      status: "found",
      file: { content: "# Big", sha: "blob-sha", name: "big.md", path: "docs/big.md" },
    })
    expect(mockOctokit.git.getBlob).toHaveBeenCalledWith(expect.objectContaining({ file_sha: "blob-sha" }))
  })
})
