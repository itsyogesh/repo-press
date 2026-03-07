import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockOctokit } = vi.hoisted(() => {
  return {
    mockOctokit: {
      git: {
        getRef: vi.fn(),
        getCommit: vi.fn(),
        createBlob: vi.fn(),
        createTree: vi.fn(),
        createCommit: vi.fn(),
        updateRef: vi.fn(),
      },
    },
  }
})

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function OctokitMock() {
    return mockOctokit
  }),
}))

import { batchCommit } from "../github"

describe("batchCommit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOctokit.git.getRef.mockResolvedValue({ data: { object: { sha: "base-sha" } } })
    mockOctokit.git.getCommit.mockResolvedValue({ data: { tree: { sha: "base-tree-sha" } } })
    mockOctokit.git.createBlob.mockResolvedValue({ data: { sha: "blob-sha" } })
    mockOctokit.git.createTree.mockResolvedValue({ data: { sha: "new-tree-sha" } })
    mockOctokit.git.createCommit.mockResolvedValue({ data: { sha: "new-commit-sha" } })
    mockOctokit.git.updateRef.mockResolvedValue({ data: {} })
  })

  it("keeps text operations as inline content tree entries", async () => {
    await batchCommit(
      "token",
      "owner",
      "repo",
      "branch",
      [{ action: "update", path: "docs/page.mdx", content: "# Hello world" }],
      "chore: update doc",
    )

    expect(mockOctokit.git.createBlob).not.toHaveBeenCalled()
    expect(mockOctokit.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        tree: [
          expect.objectContaining({
            path: "docs/page.mdx",
            type: "blob",
            content: "# Hello world",
          }),
        ],
      }),
    )
  })

  it("creates blob objects for base64 binary operations and links them in the tree", async () => {
    await batchCommit(
      "token",
      "owner",
      "repo",
      "branch",
      [
        {
          action: "create",
          path: "public/images/hero.png",
          content: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
          contentEncoding: "base64",
        },
      ],
      "chore: add media",
    )

    expect(mockOctokit.git.createBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
        encoding: "base64",
      }),
    )
    expect(mockOctokit.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        tree: [
          expect.objectContaining({
            path: "public/images/hero.png",
            type: "blob",
            sha: "blob-sha",
          }),
        ],
      }),
    )
  })
})
