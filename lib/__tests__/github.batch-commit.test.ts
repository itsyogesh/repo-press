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
        createRef: vi.fn(),
        deleteRef: vi.fn(),
        getBlob: vi.fn(),
      },
      repos: {
        getContent: vi.fn(),
      },
    },
  }
})

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function OctokitMock() {
    return mockOctokit
  }),
}))

import {
  batchCommit,
  batchCommitAtExpectedHead,
  createBranchFromSha,
  deleteBranchRef,
  getTextFilesAtCommit,
} from "../github"

describe("batchCommit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOctokit.git.getRef.mockResolvedValue({ data: { object: { sha: "base-sha" } } })
    mockOctokit.git.getCommit.mockResolvedValue({ data: { tree: { sha: "base-tree-sha" } } })
    mockOctokit.git.createBlob.mockResolvedValue({ data: { sha: "blob-sha" } })
    mockOctokit.git.createTree.mockResolvedValue({ data: { sha: "new-tree-sha" } })
    mockOctokit.git.createCommit.mockResolvedValue({ data: { sha: "new-commit-sha" } })
    mockOctokit.git.updateRef.mockResolvedValue({ data: {} })
    mockOctokit.git.createRef.mockResolvedValue({ data: {} })
    mockOctokit.git.deleteRef.mockResolvedValue({ data: {} })
    mockOctokit.git.getBlob.mockResolvedValue({ data: { content: Buffer.from("blob text").toString("base64") } })
    mockOctokit.repos.getContent.mockResolvedValue({
      data: { sha: "d".repeat(40), content: Buffer.from("file text").toString("base64") },
    })
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

  it("creates a dedicated branch directly from the reviewed base SHA", async () => {
    const sha = "a".repeat(40)
    await createBranchFromSha("token", "owner", "repo", "repopress/install/callout", sha)
    expect(mockOctokit.git.createRef).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      ref: "refs/heads/repopress/install/callout",
      sha,
    })
    expect(mockOctokit.git.updateRef).not.toHaveBeenCalled()
  })

  it("makes one exact tree/commit/ref update against the expected dedicated-branch head", async () => {
    const baseSha = "a".repeat(40)
    mockOctokit.git.getRef.mockResolvedValue({ data: { object: { sha: baseSha } } })
    await batchCommitAtExpectedHead(
      "token",
      "owner",
      "repo",
      { branch: "repopress/install/callout", protectedBaseBranch: "main", expectedHeadSha: baseSha },
      [{ action: "create", path: "components/callout.tsx", content: "export {}\n" }],
      "Install callout",
    )
    expect(mockOctokit.git.createTree).toHaveBeenCalledOnce()
    expect(mockOctokit.git.createCommit).toHaveBeenCalledOnce()
    expect(mockOctokit.git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ parents: [baseSha], message: "Install callout" }),
    )
    expect(mockOctokit.git.updateRef).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      ref: "heads/repopress/install/callout",
      sha: "new-commit-sha",
      force: false,
    })
  })

  it("rejects base writes, drift, and unsafe paths before creating a tree", async () => {
    const baseSha = "a".repeat(40)
    await expect(
      batchCommitAtExpectedHead(
        "token",
        "owner",
        "repo",
        { branch: "main", protectedBaseBranch: "main", expectedHeadSha: baseSha },
        [{ action: "update", path: "safe.ts", content: "ok" }],
        "unsafe",
      ),
    ).rejects.toThrow("protected base branch")
    mockOctokit.git.getRef.mockResolvedValue({ data: { object: { sha: "b".repeat(40) } } })
    await expect(
      batchCommitAtExpectedHead(
        "token",
        "owner",
        "repo",
        { branch: "repopress/install/callout", protectedBaseBranch: "main", expectedHeadSha: baseSha },
        [{ action: "update", path: "safe.ts", content: "ok" }],
        "drift",
      ),
    ).rejects.toThrow("head changed")
    await expect(
      batchCommitAtExpectedHead(
        "token",
        "owner",
        "repo",
        { branch: "repopress/install/callout", protectedBaseBranch: "main", expectedHeadSha: baseSha },
        [{ action: "create", path: "../escape.ts", content: "no" }],
        "unsafe",
      ),
    ).rejects.toThrow("path")
    expect(mockOctokit.git.createTree).not.toHaveBeenCalled()
  })

  it("deletes only a validated dedicated branch ref", async () => {
    await deleteBranchRef("token", "owner", "repo", "repopress/install/callout")
    expect(mockOctokit.git.deleteRef).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      ref: "heads/repopress/install/callout",
    })
    await expect(deleteBranchRef("token", "owner", "repo", "main")).rejects.toThrow("dedicated")
  })

  it("reads bounded text snapshots at the exact immutable commit and treats only 404 as missing", async () => {
    const sha = "a".repeat(40)
    const snapshots = await getTextFilesAtCommit("token", "owner", "repo", sha, ["package.json"])
    expect(snapshots).toEqual([{ path: "package.json", content: "file text" }])
    expect(mockOctokit.repos.getContent).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      path: "package.json",
      ref: sha,
    })
    mockOctokit.repos.getContent.mockRejectedValueOnce({ status: 404 })
    await expect(getTextFilesAtCommit("token", "owner", "repo", sha, ["missing.json"])).resolves.toEqual([])
    mockOctokit.repos.getContent.mockRejectedValueOnce({ status: 500 })
    await expect(getTextFilesAtCommit("token", "owner", "repo", sha, ["failed.json"])).rejects.toMatchObject({
      status: 500,
    })
  })
})
