import { createHash } from "node:crypto"
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
        getTree: vi.fn(),
      },
      repos: {
        getContent: vi.fn(),
      },
      pulls: {
        list: vi.fn(),
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
  findOpenPullRequestByHead,
  getDedicatedBranchState,
  getTextFilesAtCommit,
  verifyBatchCommitTree,
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
    mockOctokit.pulls.list.mockResolvedValue({ data: [] })
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

  it("rejects mutable expected-head accessors without invoking them or updating a ref", async () => {
    const baseSha = "a".repeat(40)
    const branchGetter = vi.fn<() => string>().mockReturnValueOnce("repopress/install/callout").mockReturnValue("main")
    const expected = Object.defineProperties(
      {},
      {
        branch: { enumerable: true, get: branchGetter },
        protectedBaseBranch: { enumerable: true, value: "main" },
        expectedHeadSha: { enumerable: true, value: baseSha },
      },
    )

    await expect(
      batchCommitAtExpectedHead(
        "token",
        "owner",
        "repo",
        expected as never,
        [{ action: "create", path: "components/callout.tsx", content: "export {}\n" }],
        "Install callout",
      ),
    ).rejects.toThrow("own data")
    expect(branchGetter).not.toHaveBeenCalled()
    expect(mockOctokit.git.updateRef).not.toHaveBeenCalled()
  })

  it("rejects an accessor batch-array entry without invoking it", async () => {
    const baseSha = "a".repeat(40)
    const entryGetter = vi.fn(() => {
      throw new Error("batch array entry getter executed")
    })
    const operations = Object.defineProperty([], "0", { get: entryGetter })
    Object.defineProperty(operations, "length", { value: 1 })

    await expect(
      batchCommitAtExpectedHead(
        "token",
        "owner",
        "repo",
        { branch: "repopress/install/callout", protectedBaseBranch: "main", expectedHeadSha: baseSha },
        operations as never,
        "Install callout",
      ),
    ).rejects.toThrow("own data")
    expect(entryGetter).not.toHaveBeenCalled()
    expect(mockOctokit.git.updateRef).not.toHaveBeenCalled()
  })

  it("rejects sparse batch-operation arrays before any Git mutation", async () => {
    const baseSha = "a".repeat(40)
    await expect(
      batchCommitAtExpectedHead(
        "token",
        "owner",
        "repo",
        { branch: "repopress/install/callout", protectedBaseBranch: "main", expectedHeadSha: baseSha },
        new Array(1) as never,
        "Install callout",
      ),
    ).rejects.toThrow("own data")
    expect(mockOctokit.git.updateRef).not.toHaveBeenCalled()
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

  it("inspects only a validated dedicated branch and binds a child commit to its exact parent", async () => {
    const baseSha = "a".repeat(40)
    const commitSha = "b".repeat(40)
    mockOctokit.git.getRef.mockResolvedValueOnce({ data: { object: { sha: baseSha } } })
    await expect(
      getDedicatedBranchState("token", "owner", "repo", "repopress/install/callout", baseSha),
    ).resolves.toEqual({ headSha: baseSha, commit: null })

    mockOctokit.git.getRef.mockResolvedValueOnce({ data: { object: { sha: commitSha } } })
    mockOctokit.git.getCommit.mockResolvedValueOnce({
      data: { message: "Install callout\n\nPlan-Digest: sha256:abc", parents: [{ sha: baseSha }] },
    })
    await expect(
      getDedicatedBranchState("token", "owner", "repo", "repopress/install/callout", baseSha),
    ).resolves.toEqual({
      headSha: commitSha,
      commit: {
        sha: commitSha,
        parents: [baseSha],
        message: "Install callout\n\nPlan-Digest: sha256:abc",
      },
    })
    await expect(getDedicatedBranchState("token", "owner", "repo", "main", baseSha)).rejects.toThrow("dedicated")
  })

  it("finds only the exact open head/base pull request", async () => {
    mockOctokit.pulls.list.mockResolvedValue({
      data: [
        {
          number: 42,
          html_url: "https://github.com/owner/repo/pull/42",
          state: "open",
          head: {
            ref: "repopress/install/callout",
            sha: "b".repeat(40),
            repo: { owner: { login: "owner" }, name: "repo" },
          },
          base: { ref: "main" },
        },
      ],
    })
    await expect(
      findOpenPullRequestByHead("token", "owner", "repo", "repopress/install/callout", "main", "b".repeat(40)),
    ).resolves.toEqual({ number: 42, htmlUrl: "https://github.com/owner/repo/pull/42" })
    expect(mockOctokit.pulls.list).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      state: "open",
      head: "owner:repopress/install/callout",
      base: "main",
      per_page: 10,
    })
  })

  it("ignores an open PR whose branch name matches but whose head SHA does not", async () => {
    mockOctokit.pulls.list.mockResolvedValue({
      data: [
        {
          number: 42,
          html_url: "https://github.com/owner/repo/pull/42",
          state: "open",
          head: {
            ref: "repopress/install/callout",
            sha: "c".repeat(40),
            repo: { owner: { login: "owner" }, name: "repo" },
          },
          base: { ref: "main" },
        },
      ],
    })
    await expect(
      findOpenPullRequestByHead("token", "owner", "repo", "repopress/install/callout", "main", "b".repeat(40)),
    ).resolves.toBeNull()
    expect(mockOctokit.pulls.list).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      state: "open",
      head: "owner:repopress/install/callout",
      base: "main",
      per_page: 10,
    })
  })

  it("proves an existing commit tree is exactly the reviewed operation set over the base", async () => {
    const baseSha = "a".repeat(40)
    const headSha = "b".repeat(40)
    const content = "reviewed content\n"
    const bytes = Buffer.from(content, "utf8")
    const blobSha = createHash("sha1").update(`blob ${bytes.byteLength}\0`, "utf8").update(bytes).digest("hex")
    mockOctokit.git.getTree
      .mockResolvedValueOnce({
        data: {
          truncated: false,
          tree: [{ path: "existing.txt", type: "blob", mode: "100644", sha: "c".repeat(40) }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          truncated: false,
          tree: [
            { path: "existing.txt", type: "blob", mode: "100644", sha: "c".repeat(40) },
            { path: "components/callout.tsx", type: "blob", mode: "100644", sha: blobSha },
          ],
        },
      })
    await expect(
      verifyBatchCommitTree("token", "owner", "repo", baseSha, headSha, [
        { action: "create", path: "components/callout.tsx", content },
      ]),
    ).resolves.toBe(true)
  })

  it("rejects truncated trees and a matching planned change accompanied by any extra leaf", async () => {
    const baseSha = "a".repeat(40)
    const headSha = "b".repeat(40)
    const content = "reviewed content\n"
    const bytes = Buffer.from(content, "utf8")
    const blobSha = createHash("sha1").update(`blob ${bytes.byteLength}\0`, "utf8").update(bytes).digest("hex")
    mockOctokit.git.getTree.mockResolvedValueOnce({ data: { truncated: false, tree: [] } }).mockResolvedValueOnce({
      data: {
        truncated: false,
        tree: [
          { path: "components/callout.tsx", type: "blob", mode: "100644", sha: blobSha },
          { path: "extra.txt", type: "blob", mode: "100644", sha: "d".repeat(40) },
        ],
      },
    })
    await expect(
      verifyBatchCommitTree("token", "owner", "repo", baseSha, headSha, [
        { action: "create", path: "components/callout.tsx", content },
      ]),
    ).resolves.toBe(false)

    mockOctokit.git.getTree.mockReset().mockResolvedValue({ data: { truncated: true, tree: [] } })
    await expect(
      verifyBatchCommitTree("token", "owner", "repo", baseSha, headSha, [
        { action: "create", path: "components/callout.tsx", content },
      ]),
    ).resolves.toBe(false)
  })

  it("never invokes operation or Git tree accessors while verifying a resumed commit", async () => {
    const baseSha = "a".repeat(40)
    const headSha = "b".repeat(40)
    const operationGetter = vi.fn(() => {
      throw new Error("operation getter executed")
    })
    const operation = Object.defineProperties(
      {},
      {
        path: { enumerable: true, get: operationGetter },
        action: { enumerable: true, value: "create" },
        content: { enumerable: true, value: "safe" },
      },
    )
    await expect(
      verifyBatchCommitTree("token", "owner", "repo", baseSha, headSha, [operation as never]),
    ).rejects.toThrow("own data")
    expect(operationGetter).not.toHaveBeenCalled()

    const treeGetter = vi.fn(() => {
      throw new Error("tree getter executed")
    })
    const hostileEntry = Object.defineProperties(
      {},
      {
        path: { enumerable: true, get: treeGetter },
        type: { enumerable: true, value: "blob" },
        mode: { enumerable: true, value: "100644" },
        sha: { enumerable: true, value: "c".repeat(40) },
      },
    )
    mockOctokit.git.getTree.mockReset().mockResolvedValue({
      data: { truncated: false, tree: [hostileEntry] },
    })
    await expect(
      verifyBatchCommitTree("token", "owner", "repo", baseSha, headSha, [
        { action: "create", path: "safe.txt", content: "safe" },
      ]),
    ).resolves.toBe(false)
    expect(treeGetter).not.toHaveBeenCalled()
  })
})
