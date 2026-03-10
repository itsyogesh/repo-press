import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { convexQueryMock } = vi.hoisted(() => ({
  convexQueryMock: vi.fn(),
}))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convexQueryMock
  },
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
process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "blob-secret-token"

import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"
import { GET } from "../route"

const projectRecord = {
  _id: "project_123",
  userId: "user_1",
  repoOwner: "acme",
  repoName: "docs-site",
  branch: "main",
}

function requestFor(path: string) {
  const searchParams = new URLSearchParams({
    projectId: "project_123",
    path,
  })
  return new Request(`http://localhost/api/media/resolve?${searchParams.toString()}`, {
    method: "GET",
  })
}

describe("GET /api/media/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexQueryMock.mockReset()
    vi.mocked(getGitHubToken).mockResolvedValue("gh-token")
    vi.mocked(fetchAuthQuery!).mockResolvedValue({ _id: "user_1" })
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_1")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("rejects unauthorized requests", async () => {
    vi.mocked(getGitHubToken).mockResolvedValue(null)

    const response = await GET(requestFor("/public/images/hero.png"))

    expect(response.status).toBe(401)
  })

  it("rejects PAT-mode media access when the PAT does not resolve to the project owner", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("different_user")
    convexQueryMock.mockResolvedValueOnce(projectRecord)

    const response = await GET(requestFor("/public/images/hero.png"))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toBe("Forbidden")
  })

  it("allows PAT-mode media access when the PAT resolves to the project owner", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_1")
    convexQueryMock.mockResolvedValueOnce(projectRecord).mockResolvedValueOnce({
      _id: "media-op-1",
      sourceType: "blob",
      blobUrl: "https://blob.vercel-storage.com/private/hero.png",
      repoPath: "/public/images/hero.png",
      mimeType: "image/png",
      status: "pending",
    })

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      }),
    )

    const response = await GET(requestFor("/public/images/hero.png"))

    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalled()
  })

  it("resolves pending blob-backed media via auth proxy fetch", async () => {
    convexQueryMock.mockResolvedValueOnce(projectRecord).mockResolvedValueOnce({
      _id: "media-op-1",
      sourceType: "blob",
      blobUrl: "https://blob.vercel-storage.com/private/hero.png",
      repoPath: "/public/images/hero.png",
      mimeType: "image/png",
      status: "pending",
    })

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/png",
          etag: '"abc123"',
        },
      }),
    )

    const response = await GET(requestFor("/public/images/hero.png"))
    const buffer = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(buffer).toEqual(Buffer.from([1, 2, 3]))
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://blob.vercel-storage.com/private/hero.png",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer blob-secret-token",
        }),
      }),
    )
  })

  it("resolves pending github-branch-backed media from the active publish branch", async () => {
    convexQueryMock.mockResolvedValueOnce(projectRecord).mockResolvedValueOnce({
      _id: "media-op-2",
      sourceType: "githubBranch",
      repoPath: "/public/images/hero.png",
      githubPath: "public/images/hero.png",
      githubBranch: "repopress/main/777",
      mimeType: "image/png",
      status: "pending",
    })

    const getContent = vi.fn().mockResolvedValue({
      data: {
        type: "file",
        name: "hero.png",
        path: "public/images/hero.png",
        sha: "blob-sha-1",
        content: Buffer.from("png-bytes").toString("base64"),
        encoding: "base64",
      },
    })

    vi.mocked(createGitHubClient).mockReturnValue({
      repos: { getContent },
      git: { getBlob: vi.fn() },
    } as any)

    const response = await GET(requestFor("/public/images/hero.png"))

    expect(response.status).toBe(200)
    expect(getContent).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: "repopress/main/777",
      }),
    )
  })

  it("falls back to base branch when no pending media op exists", async () => {
    convexQueryMock.mockResolvedValueOnce(projectRecord).mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    const getContent = vi.fn().mockResolvedValue({
      data: {
        type: "file",
        name: "hero.png",
        path: "public/images/hero.png",
        sha: "blob-sha-base",
        content: Buffer.from("base-branch-bytes").toString("base64"),
        encoding: "base64",
      },
    })

    vi.mocked(createGitHubClient).mockReturnValue({
      repos: { getContent },
      git: { getBlob: vi.fn() },
    } as any)

    const response = await GET(requestFor("/public/images/hero.png"))

    expect(response.status).toBe(200)
    expect(getContent).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: "main",
      }),
    )
  })

  it("falls back to active publish branch when staged op has already been committed", async () => {
    convexQueryMock.mockResolvedValueOnce(projectRecord).mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: "publish-branch-1",
      branchName: "repopress/main/999",
    })

    const getContent = vi.fn().mockResolvedValue({
      data: {
        type: "file",
        name: "hero.png",
        path: "public/images/hero.png",
        sha: "blob-sha-publish",
        content: Buffer.from("publish-branch-bytes").toString("base64"),
        encoding: "base64",
      },
    })

    vi.mocked(createGitHubClient).mockReturnValue({
      repos: { getContent },
      git: { getBlob: vi.fn() },
    } as any)

    const response = await GET(requestFor("/public/images/hero.png"))

    expect(response.status).toBe(200)
    expect(getContent).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: "repopress/main/999",
      }),
    )
  })

  it("returns 404 when file is not found in staged or base branch sources", async () => {
    convexQueryMock.mockResolvedValueOnce(projectRecord).mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    const getContent = vi.fn().mockRejectedValue({ status: 404, message: "Not Found" })
    vi.mocked(createGitHubClient).mockReturnValue({
      repos: { getContent },
      git: { getBlob: vi.fn() },
    } as any)

    const response = await GET(requestFor("/public/images/missing.png"))
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error).toContain("not found")
  })

  it("falls back to public/ path when resolving Next.js public assets", async () => {
    convexQueryMock.mockResolvedValueOnce(projectRecord).mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    const getContent = vi.fn().mockImplementation(async ({ path }: { path: string }) => {
      if (path === "images/blog/hero.png") {
        throw { status: 404, message: "Not Found" }
      }
      if (path === "public/images/blog/hero.png") {
        return {
          data: {
            type: "file",
            name: "hero.png",
            path,
            sha: "blob-sha-public-image",
            content: Buffer.from("public-image-bytes").toString("base64"),
            encoding: "base64",
          },
        }
      }
      throw { status: 404, message: "Not Found" }
    })

    vi.mocked(createGitHubClient).mockReturnValue({
      repos: { getContent },
      git: { getBlob: vi.fn() },
    } as any)

    const response = await GET(requestFor("/images/blog/hero.png"))
    const buffer = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(buffer).toEqual(Buffer.from("public-image-bytes"))
    expect(getContent).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "public/images/blog/hero.png",
      }),
    )
  })
})
