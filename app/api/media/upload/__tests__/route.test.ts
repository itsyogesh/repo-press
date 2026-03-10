import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { convexQueryMock, convexMutationMock } = vi.hoisted(() => ({
  convexQueryMock: vi.fn(),
  convexMutationMock: vi.fn(),
}))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convexQueryMock
    mutation = convexMutationMock
  },
}))

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
}))

vi.mock("@/lib/auth-server", () => ({
  fetchAuthQuery: vi.fn(),
  getGitHubToken: vi.fn(),
  getPatAuthUserId: vi.fn(),
}))

vi.mock("@/lib/github", async () => {
  const actual = await vi.importActual<typeof import("@/lib/github")>("@/lib/github")
  return {
    ...actual,
    createGitHubClient: vi.fn(),
  }
})

process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://example.convex.cloud"

import { put } from "@vercel/blob"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"
import { POST } from "../route"

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/media/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function baseBody() {
  return {
    projectId: "project_123",
    owner: "acme",
    repo: "docs-site",
    branch: "main",
    pathHint: "public/images",
    fileName: "hero.png",
    contentBase64: Buffer.from("image-bytes").toString("base64"),
    storagePreference: "auto",
  }
}

const projectRecord = {
  _id: "project_123",
  userId: "user_1",
  repoOwner: "acme",
  repoName: "docs-site",
  branch: "main",
}

describe("POST /api/media/upload", () => {
  const baseGithubClient = {
    repos: {
      getContent: vi.fn().mockRejectedValue({ status: 404, message: "Not Found" }),
      createOrUpdateFileContents: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    process.env.BLOB_READ_WRITE_TOKEN = "blob-token"
    vi.mocked(getGitHubToken).mockResolvedValue("gh-token")
    vi.mocked(fetchAuthQuery!).mockResolvedValue({ _id: "user_1" })
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_1")
    vi.mocked(createGitHubClient).mockReturnValue(baseGithubClient as any)
    convexQueryMock.mockResolvedValue(projectRecord)
    convexMutationMock.mockResolvedValue("media-op-1")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("stages blob-backed media and returns repoPath + previewUrl", async () => {
    vi.mocked(put).mockResolvedValue({ url: "https://blob.vercel-storage.com/repo-press/hero.png" } as any)

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      storage: "blob",
      repoPath: "/public/images/hero.png",
      staged: true,
      mediaOpId: "media-op-1",
    })
    expect(payload.previewUrl).toBe("/api/media/resolve?projectId=project_123&path=%2Fpublic%2Fimages%2Fhero.png")
    expect(vi.mocked(put).mock.calls[0]?.[2]).toEqual(expect.objectContaining({ allowOverwrite: true }))
    expect(convexMutationMock).toHaveBeenCalled()
  })

  it("rejects uploads when request repo context does not match the project", async () => {
    vi.mocked(put).mockResolvedValue({ url: "https://blob.vercel-storage.com/repo-press/hero.png" } as any)

    const response = await POST(
      buildRequest({
        ...baseBody(),
        repo: "different-repo",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("repo context")
    expect(convexMutationMock).not.toHaveBeenCalled()
  })

  it("rejects PAT-mode uploads when the PAT does not resolve to the project owner", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("different_user")

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toContain("Unauthorized")
    expect(convexMutationMock).not.toHaveBeenCalled()
  })

  it("allows PAT-mode uploads when the PAT resolves to the project owner", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_1")
    vi.mocked(put).mockResolvedValue({ url: "https://blob.vercel-storage.com/repo-press/hero.png" } as any)

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(200)
    expect(convexMutationMock).toHaveBeenCalled()
  })

  it("retries blob upload with private access when public upload fails with access issues", async () => {
    vi.mocked(put)
      .mockRejectedValueOnce(new Error("public access is not allowed for this token"))
      .mockResolvedValueOnce({ url: "https://blob.vercel-storage.com/repo-press/hero.png" } as any)

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.storage).toBe("blob")
    expect(vi.mocked(put)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(put).mock.calls[0]?.[2]).toEqual(expect.objectContaining({ access: "public" }))
    expect(vi.mocked(put).mock.calls[1]?.[2]).toEqual(expect.objectContaining({ access: "private" }))
  })

  it("falls back to active publish branch on blob failure and stages githubBranch source", async () => {
    vi.mocked(put).mockRejectedValue(new Error("blob unavailable"))
    convexQueryMock.mockResolvedValueOnce(projectRecord).mockResolvedValueOnce({
      _id: "publish-branch-1",
      branchName: "repopress/main/1234",
    })

    const createOrUpdateFileContents = vi
      .fn()
      .mockResolvedValue({ data: { content: { sha: "blob-sha-1" }, commit: { sha: "commit-sha-1" } } })
    vi.mocked(createGitHubClient).mockReturnValue({
      repos: {
        createOrUpdateFileContents,
        getContent: vi.fn(),
      },
    } as any)

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      storage: "github",
      repoPath: "/public/images/hero.png",
      staged: true,
    })
    expect(createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "repopress/main/1234",
      }),
    )
  })

  it("returns 409 when blob fails and no active publish branch exists", async () => {
    vi.mocked(put).mockRejectedValue(new Error("blob unavailable"))
    convexQueryMock.mockResolvedValueOnce(projectRecord).mockResolvedValueOnce(null)

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error).toContain("publish branch")
  })

  it("handles SHA-required update path on github fallback uploads", async () => {
    vi.mocked(put).mockRejectedValue(new Error("blob unavailable"))
    convexQueryMock.mockResolvedValueOnce(projectRecord).mockResolvedValueOnce({
      _id: "publish-branch-1",
      branchName: "repopress/main/1234",
    })

    const createOrUpdateFileContents = vi
      .fn()
      .mockRejectedValueOnce({ status: 422, message: "sha is required" })
      .mockResolvedValueOnce({ data: { content: { sha: "blob-sha-2" }, commit: { sha: "commit-sha-2" } } })
    const getContent = vi.fn().mockResolvedValue({ data: { sha: "existing-sha" } })

    vi.mocked(createGitHubClient).mockReturnValue({
      repos: {
        createOrUpdateFileContents,
        getContent,
      },
    } as any)

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(200)
    expect(createOrUpdateFileContents).toHaveBeenCalledTimes(2)
    expect(createOrUpdateFileContents.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        sha: "existing-sha",
      }),
    )
  })
})
