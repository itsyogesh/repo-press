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

vi.mock("@/lib/github-permissions", () => ({
  getRepoRole: vi.fn(),
  probeRepoReadAccess: vi.fn().mockResolvedValue(null),
  roleAtLeast: (actual: string, minimum: string) => {
    const h: Record<string, number> = { owner: 3, editor: 2, viewer: 1 }
    return (h[actual] ?? 0) >= (h[minimum] ?? 0)
  },
}))

process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://example.convex.cloud"

import { put } from "@vercel/blob"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"
import { getRepoRole } from "@/lib/github-permissions"
import { POST } from "../route"

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/media/download-external", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function baseBody() {
  return {
    projectId: "project_123",
    owner: "droidsize",
    repo: "collective.domains",
    branch: "main",
    pathHint: "public/images/blog/creative-domain-ideas",
    url: "https://images.example.com/creative-domain-ideas.png",
  }
}

const projectRecord = {
  _id: "project_123",
  userId: "user_1",
  repoOwner: "droidsize",
  repoName: "collective.domains",
  branch: "main",
}

describe("POST /api/media/download-external", () => {
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
    vi.mocked(getRepoRole).mockResolvedValue({ role: "owner", defaultBranch: "main", defaultBranchInferred: false })
    vi.mocked(createGitHubClient).mockReturnValue({
      ...baseGithubClient,
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({ data: { login: "user_1" } }),
      },
    } as any)
    convexQueryMock.mockResolvedValue(projectRecord)
    convexMutationMock.mockResolvedValue("media-op-1")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("downloads the image, stages blob-backed media, and returns repoPath + previewUrl", async () => {
    vi.mocked(put).mockResolvedValue({
      url: "https://blob.vercel-storage.com/repo-press/creative-domain-ideas.png",
    } as any)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      }),
    )

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      storage: "blob",
      repoPath: "/public/images/blog/creative-domain-ideas/creative-domain-ideas.png",
      staged: true,
      mediaOpId: "media-op-1",
    })
    expect(payload.previewUrl).toBe(
      "/api/media/resolve?projectId=project_123&path=%2Fpublic%2Fimages%2Fblog%2Fcreative-domain-ideas%2Fcreative-domain-ideas.png",
    )
    expect(fetchSpy).toHaveBeenCalledWith("https://images.example.com/creative-domain-ideas.png")
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        repoPath: "/public/images/blog/creative-domain-ideas/creative-domain-ideas.png",
        fileName: "creative-domain-ideas.png",
        mimeType: "image/png",
      }),
    )
    const mediaAssetCall = convexMutationMock.mock.calls.find(
      ([, args]) =>
        args &&
        typeof args === "object" &&
        (args as Record<string, unknown>).filePath ===
          "/public/images/blog/creative-domain-ideas/creative-domain-ideas.png",
    )
    expect(mediaAssetCall?.[1]).toEqual(
      expect.objectContaining({
        projectId: "project_123",
        userId: "user_1",
        fileName: "creative-domain-ideas.png",
        filePath: "/public/images/blog/creative-domain-ideas/creative-domain-ideas.png",
        mimeType: "image/png",
        sizeBytes: 3,
        originalUrl: "https://images.example.com/creative-domain-ideas.png",
        width: undefined,
        height: undefined,
      }),
    )
  })

  it("threads sourceFilePath into staged external media ops", async () => {
    vi.mocked(put).mockResolvedValue({
      url: "https://blob.vercel-storage.com/repo-press/creative-domain-ideas.png",
    } as any)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      }),
    )

    const response = await POST(
      buildRequest({
        ...baseBody(),
        sourceFilePath: "content/blog/creative-domain-ideas.mdx",
      }),
    )

    expect(response.status).toBe(200)
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        repoPath: "/public/images/blog/creative-domain-ideas/creative-domain-ideas.png",
        sourceFilePath: "content/blog/creative-domain-ideas.mdx",
      }),
    )
  })

  it("retries blob upload with private access when public upload fails with an access-policy error", async () => {
    vi.mocked(put)
      .mockRejectedValueOnce(new Error("This token does not allow public uploads"))
      .mockResolvedValueOnce({
        url: "https://blob.vercel-storage.com/repo-press/creative-domain-ideas.png",
      } as any)

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      }),
    )

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.storage).toBe("blob")
    expect(vi.mocked(put)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(put).mock.calls[0]?.[2]).toEqual(expect.objectContaining({ access: "public" }))
    expect(vi.mocked(put).mock.calls[1]?.[2]).toEqual(expect.objectContaining({ access: "private" }))
  })

  it("rejects non-image downloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      }),
    )

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("image")
    expect(vi.mocked(put)).not.toHaveBeenCalled()
  })
})
