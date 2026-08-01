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

// Mock uploadToConvexStorage so tests don't need a real Convex instance.
vi.mock("@/lib/studio/media-upload-shared", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studio/media-upload-shared")>(
    "@/lib/studio/media-upload-shared",
  )
  return {
    ...actual,
    uploadToConvexStorage: vi.fn().mockResolvedValue({ storageId: "storage_abc123" }),
  }
})

process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://example.convex.cloud"

import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"
import { getRepoRole } from "@/lib/github-permissions"
import { POST } from "../route"

const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII="
const VALID_PNG_BYTES = Buffer.from(VALID_PNG_BASE64, "base64")

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
    contentBase64: VALID_PNG_BASE64,
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
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REPOPRESS_CAPABILITY_SECRET = "test-capability-secret-at-least-32"
    vi.mocked(getGitHubToken).mockResolvedValue("gh-token")
    vi.mocked(fetchAuthQuery!).mockResolvedValue({ _id: "user_1" })
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_1")
    vi.mocked(getRepoRole).mockResolvedValue({ role: "owner", defaultBranch: "main", defaultBranchInferred: false })
    vi.mocked(createGitHubClient).mockReturnValue({
      repos: {
        getContent: vi.fn().mockRejectedValue({ status: 404, message: "Not Found" }),
        createOrUpdateFileContents: vi.fn(),
      },
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({ data: { login: "user_1" } }),
      },
    } as any)
    convexQueryMock.mockResolvedValue(projectRecord)
    // mediaOps.stage returns a structured result; other mutations
    // (recordMediaAsset) return plain values.
    convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) =>
      args && typeof args === "object" && "sourceType" in (args as Record<string, unknown>)
        ? { staged: true, mediaOpId: "media-op-1" }
        : "media-op-1",
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("stages Convex-backed media and returns repoPath + previewUrl", async () => {
    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      storage: "convex",
      repoPath: "/public/images/hero.png",
      staged: true,
      mediaOpId: "media-op-1",
    })
    expect(payload.previewUrl).toBe("/api/media/resolve?projectId=project_123&path=%2Fpublic%2Fimages%2Fhero.png")
    expect(convexMutationMock).toHaveBeenCalled()
  })

  it("stages with sourceType convex and convexStorageId", async () => {
    const response = await POST(buildRequest(baseBody()))
    expect(response.status).toBe(200)

    const stagingCall = convexMutationMock.mock.calls.find(
      ([, args]) => args && typeof args === "object" && (args as Record<string, unknown>).repoPath !== undefined,
    )
    expect(stagingCall?.[1]).toMatchObject({
      sourceType: "convex",
      convexStorageId: "storage_abc123",
    })
  })

  it("threads sourceFilePath into staged media ops", async () => {
    const response = await POST(
      buildRequest({
        ...baseBody(),
        sourceFilePath: "content/blog/hero-guide.mdx",
      }),
    )

    expect(response.status).toBe(200)
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        repoPath: "/public/images/hero.png",
        sourceFilePath: "content/blog/hero-guide.mdx",
      }),
    )
  })

  it("records media asset with correct metadata", async () => {
    const response = await POST(buildRequest(baseBody()))
    expect(response.status).toBe(200)

    const assetCall = convexMutationMock.mock.calls.find(
      ([, args]) =>
        args && typeof args === "object" && (args as Record<string, unknown>).filePath === "/public/images/hero.png",
    )
    expect(assetCall?.[1]).toEqual(
      expect.objectContaining({
        projectId: "project_123",
        fileName: "hero.png",
        filePath: "/public/images/hero.png",
        mimeType: "image/png",
        sizeBytes: VALID_PNG_BYTES.byteLength,
        width: 1,
        height: 1,
      }),
    )
  })

  it("returns a truthful 409 when staging is rejected because a publish is finalizing", async () => {
    convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) =>
      args && typeof args === "object" && "sourceType" in (args as Record<string, unknown>)
        ? { staged: false, reason: "publish-in-progress" }
        : "media-op-1",
    )

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error).toContain("publish is finalizing")
    // No media asset is recorded for a rejected upload.
    const assetCalls = convexMutationMock.mock.calls.filter(
      (call: any[]) => call[1]?.filePath === "/public/images/hero.png",
    )
    expect(assetCalls).toHaveLength(0)
  })

  it("rejects uploads when request repo context does not match the project", async () => {
    const response = await POST(
      buildRequest({
        ...baseBody(),
        repo: "different-repo",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("repo context")
    const stagingCalls = convexMutationMock.mock.calls.filter((call: any[]) => call[1]?.repoPath !== undefined)
    expect(stagingCalls).toHaveLength(0)
  })

  it("rejects PAT-mode uploads when the PAT user has no repo access", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("different_user")
    vi.mocked(getRepoRole).mockResolvedValue({ role: null, defaultBranch: null, defaultBranchInferred: false })

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toContain("no access")
    expect(convexMutationMock).not.toHaveBeenCalled()
  })

  it("allows PAT-mode uploads when the PAT resolves to the project owner", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_1")

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(200)
    expect(convexMutationMock).toHaveBeenCalled()
  })
})
