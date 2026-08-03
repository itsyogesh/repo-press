import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockOctokit } = vi.hoisted(() => ({
  mockOctokit: {
    repos: { getContent: vi.fn() },
    git: { getBlob: vi.fn() },
  },
}))

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function OctokitMock() {
    return mockOctokit
  }),
}))

import { GitHubReadError, getFileBytesForPublish } from "../github"

const MAX_BYTES = 8

function contentsData(overrides: Record<string, unknown> = {}) {
  const bytes = Uint8Array.from([1, 2, 3])
  return {
    content: Buffer.from(bytes).toString("base64"),
    encoding: "base64",
    size: bytes.byteLength,
    sha: "sha-1",
    name: "cover.png",
    path: "public/cover.png",
    ...overrides,
  }
}

describe("getFileBytesForPublish", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns inline bytes without constructing text", async () => {
    mockOctokit.repos.getContent.mockResolvedValue({ data: contentsData() })
    await expect(
      getFileBytesForPublish("token", "acme", "site", "public/cover.png", "a".repeat(40), MAX_BYTES),
    ).resolves.toEqual({
      status: "found",
      file: {
        bytes: Uint8Array.from([1, 2, 3]),
        sha: "sha-1",
        name: "cover.png",
        path: "public/cover.png",
      },
    })
    expect(mockOctokit.git.getBlob).not.toHaveBeenCalled()
  })

  it("keeps the typed absent versus ambiguous-error contract", async () => {
    mockOctokit.repos.getContent.mockRejectedValueOnce(Object.assign(new Error("missing"), { status: 404 }))
    await expect(
      getFileBytesForPublish("token", "acme", "site", "missing.png", "a".repeat(40), MAX_BYTES),
    ).resolves.toEqual({ status: "absent" })

    mockOctokit.repos.getContent.mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 500 }))
    await expect(
      getFileBytesForPublish("token", "acme", "site", "cover.png", "a".repeat(40), MAX_BYTES),
    ).rejects.toBeInstanceOf(GitHubReadError)
  })

  it.each([
    ["missing", undefined],
    ["string", "3"],
    ["fraction", 1.5],
    ["negative", -1],
  ])("rejects a %s Contents size before decoding or fetching a blob", async (_label, size) => {
    mockOctokit.repos.getContent.mockResolvedValue({ data: contentsData({ size, content: "" }) })
    await expect(
      getFileBytesForPublish("token", "acme", "site", "cover.png", "a".repeat(40), MAX_BYTES),
    ).rejects.toBeInstanceOf(GitHubReadError)
    expect(mockOctokit.git.getBlob).not.toHaveBeenCalled()
  })

  it("rejects an oversized declared Contents size before fetching a blob", async () => {
    mockOctokit.repos.getContent.mockResolvedValue({ data: contentsData({ size: MAX_BYTES + 1, content: "" }) })
    await expect(
      getFileBytesForPublish("token", "acme", "site", "cover.png", "a".repeat(40), MAX_BYTES),
    ).rejects.toBeInstanceOf(GitHubReadError)
    expect(mockOctokit.git.getBlob).not.toHaveBeenCalled()
  })

  it("rejects malformed or defensively oversized inline base64", async () => {
    mockOctokit.repos.getContent.mockResolvedValueOnce({ data: contentsData({ content: "%%%", size: 2 }) })
    await expect(
      getFileBytesForPublish("token", "acme", "site", "cover.png", "a".repeat(40), MAX_BYTES),
    ).rejects.toBeInstanceOf(GitHubReadError)

    mockOctokit.repos.getContent.mockResolvedValueOnce({
      data: contentsData({ content: Buffer.from([1, 2, 3, 4]).toString("base64"), size: 3 }),
    })
    await expect(
      getFileBytesForPublish("token", "acme", "site", "cover.png", "a".repeat(40), MAX_BYTES),
    ).rejects.toBeInstanceOf(GitHubReadError)

    mockOctokit.repos.getContent.mockResolvedValueOnce({
      data: contentsData({ content: "A".repeat(64), size: MAX_BYTES }),
    })
    await expect(
      getFileBytesForPublish("token", "acme", "site", "cover.png", "a".repeat(40), MAX_BYTES),
    ).rejects.toBeInstanceOf(GitHubReadError)
  })

  it("accepts an inline file exactly at the byte bound", async () => {
    const bytes = Uint8Array.from({ length: MAX_BYTES }, (_, index) => index)
    mockOctokit.repos.getContent.mockResolvedValue({
      data: contentsData({ content: Buffer.from(bytes).toString("base64"), size: MAX_BYTES }),
    })
    const result = await getFileBytesForPublish("token", "acme", "site", "cover.png", "a".repeat(40), MAX_BYTES)
    expect(result.status).toBe("found")
    if (result.status === "found") expect(result.file.bytes).toEqual(bytes)
  })

  it("reads blob bytes only after both declared sizes pass", async () => {
    mockOctokit.repos.getContent.mockResolvedValue({
      data: contentsData({ content: "", encoding: "none", size: 3, sha: "blob-sha" }),
    })
    mockOctokit.git.getBlob.mockResolvedValue({
      data: { content: Buffer.from([4, 5, 6]).toString("base64"), encoding: "base64", size: 3 },
    })
    await expect(
      getFileBytesForPublish("token", "acme", "site", "cover.png", "a".repeat(40), MAX_BYTES),
    ).resolves.toMatchObject({ status: "found", file: { bytes: Uint8Array.from([4, 5, 6]), sha: "blob-sha" } })
  })

  it("accepts a blob exactly at the byte bound", async () => {
    const bytes = Uint8Array.from({ length: MAX_BYTES }, (_, index) => index)
    mockOctokit.repos.getContent.mockResolvedValue({
      data: contentsData({ content: "", encoding: "none", size: MAX_BYTES, sha: "blob-sha" }),
    })
    mockOctokit.git.getBlob.mockResolvedValue({
      data: { content: Buffer.from(bytes).toString("base64"), encoding: "base64", size: MAX_BYTES },
    })
    const result = await getFileBytesForPublish("token", "acme", "site", "cover.png", "a".repeat(40), MAX_BYTES)
    expect(result.status).toBe("found")
    if (result.status === "found") expect(result.file.bytes).toEqual(bytes)
  })

  it.each([
    ["missing", undefined],
    ["oversize", MAX_BYTES + 1],
    ["mismatch", 4],
  ])("rejects a %s blob size before blob base64 decoding", async (_label, blobSize) => {
    mockOctokit.repos.getContent.mockResolvedValue({
      data: contentsData({ content: "", encoding: "none", size: 3, sha: "blob-sha" }),
    })
    mockOctokit.git.getBlob.mockResolvedValue({
      data: { content: Buffer.from([4, 5, 6]).toString("base64"), encoding: "base64", size: blobSize },
    })
    await expect(
      getFileBytesForPublish("token", "acme", "site", "cover.png", "a".repeat(40), MAX_BYTES),
    ).rejects.toBeInstanceOf(GitHubReadError)
  })
})
