import { beforeEach, describe, expect, it, vi } from "vitest"

const { convexQueryMock } = vi.hoisted(() => ({ convexQueryMock: vi.fn() }))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convexQueryMock
  },
}))
vi.mock("@/lib/project-access-token", () => ({ mintServerQueryToken: vi.fn().mockResolvedValue("server-token") }))
vi.mock("@/lib/route-auth", () => ({
  RouteAuthError: class RouteAuthError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message)
    }
  },
  resolveRouteAuth: vi.fn(),
}))
vi.mock("@/lib/github", () => ({
  GitHubReadError: class GitHubReadError extends Error {},
  getBranchHeadSha: vi.fn(),
  getFileForPublish: vi.fn(),
}))
vi.mock("@/lib/server/external-image", () => ({
  detectImageMimeType: vi.fn().mockReturnValue("image/png"),
  ExternalImageError: class ExternalImageError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message)
    }
  },
  fetchBoundedExternalImage: vi.fn(),
}))

process.env.NEXT_PUBLIC_CONVEX_URL ||= "https://example.convex.cloud"

import { GitHubReadError, getBranchHeadSha, getFileForPublish } from "@/lib/github"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"
import { ExternalImageError, fetchBoundedExternalImage } from "@/lib/server/external-image"
import { POST } from "../route"

const BASE_SHA = "a".repeat(40)
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const project = {
  _id: "project-1",
  userId: "tenant-1",
  repoOwner: "merry",
  repoName: "magic-mail",
  branch: "main",
}

function request(overrides: Record<string, unknown> = {}, origin = "https://app.repopress.test") {
  return new Request("https://app.repopress.test/api/preview/asset", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: "project-1",
      filePath: "content/blog/post/page.mdx",
      baseCommitSha: BASE_SHA,
      source: "https://images.example.test/cover.png",
      ...overrides,
    }),
  })
}

describe("POST /api/preview/asset", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexQueryMock.mockResolvedValue(project)
    vi.mocked(resolveRouteAuth).mockResolvedValue({
      actingUserId: "tenant-1",
      role: "owner",
      projectAccessToken: "project-token",
      githubToken: "gh-token",
    })
    vi.mocked(getBranchHeadSha).mockResolvedValue(BASE_SHA)
    vi.mocked(fetchBoundedExternalImage).mockResolvedValue({ bytes: PNG, mimeType: "image/png" })
    vi.mocked(getFileForPublish).mockResolvedValue({
      status: "found",
      file: { content: "binary-placeholder", bytes: PNG, sha: "b".repeat(40), name: "cover.png", path: "cover.png" },
    } as never)
  })

  it.each([
    [401, new RouteAuthError("Unauthorized", 401)],
    [403, new RouteAuthError("Forbidden", 403)],
  ])("requires project editor authority (%s)", async (status, error) => {
    vi.mocked(resolveRouteAuth).mockRejectedValue(error)
    const response = await POST(request())
    expect(response.status).toBe(status)
    expect(getBranchHeadSha).not.toHaveBeenCalled()
    expect(await response.json()).toEqual({ error: "Preview asset unavailable" })
  })

  it("fails closed when the immutable base head has moved", async () => {
    vi.mocked(getBranchHeadSha).mockResolvedValue("c".repeat(40))
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect(fetchBoundedExternalImage).not.toHaveBeenCalled()
    expect(getFileForPublish).not.toHaveBeenCalled()
  })

  it("returns bounded external bytes with only private non-sniffable response metadata", async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(response.headers.get("content-length")).toBe(String(PNG.byteLength))
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect([...response.headers.keys()].sort()).toEqual([
      "cache-control",
      "content-length",
      "content-type",
      "x-content-type-options",
    ])
    expect(fetchBoundedExternalImage).toHaveBeenCalledWith({
      url: "https://images.example.test/cover.png",
      maxBytes: 4 * 1024 * 1024,
      timeoutMs: 5_000,
      allowedMimeTypes: new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]),
    })
  })

  it.each([
    ["images/cover.png", "content/blog/post/images/cover.png"],
    ["./images/cover.png", "content/blog/post/images/cover.png"],
    ["/public/images/cover.png", "public/images/cover.png"],
  ])("reads repository source %s at the exact pinned commit", async (source, repoPath) => {
    const response = await POST(request({ source }))
    expect(response.status).toBe(200)
    expect(getFileForPublish).toHaveBeenCalledWith("gh-token", "merry", "magic-mail", repoPath, BASE_SHA)
    expect(fetchBoundedExternalImage).not.toHaveBeenCalled()
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
  })

  it("returns an opaque 404 when a repository image is absent", async () => {
    vi.mocked(getFileForPublish).mockResolvedValue({ status: "absent" })
    const response = await POST(request({ source: "/public/images/missing.png" }))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "Preview asset unavailable" })
  })

  it("fails closed when a typed repository read does not expose raw bytes", async () => {
    vi.mocked(getFileForPublish).mockResolvedValue({
      status: "found",
      file: { content: "decoded-only", sha: "b".repeat(40), name: "cover.png", path: "public/cover.png" },
    })
    const response = await POST(request({ source: "/public/cover.png" }))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "Preview asset unavailable" })
  })

  it("revalidates helper output and never serves SVG bytes", async () => {
    vi.mocked(fetchBoundedExternalImage).mockResolvedValue({
      bytes: new TextEncoder().encode("<svg><script>alert(1)</script></svg>"),
      mimeType: "image/svg+xml",
    })
    const response = await POST(request())
    expect(response.status).toBe(415)
    expect(response.headers.get("content-type")).toBe("application/json")
    expect(await response.text()).not.toContain("script")
  })

  it("does not leak upstream errors, final URLs, or repository paths", async () => {
    vi.mocked(fetchBoundedExternalImage).mockRejectedValue(
      new ExternalImageError("upstream", "https://private.example/final.png leaked"),
    )
    const response = await POST(request())
    const body = await response.text()
    expect(response.status).toBe(502)
    expect(body).toBe('{"error":"Preview asset unavailable"}')
    expect(body).not.toContain("private.example")

    vi.mocked(getFileForPublish).mockRejectedValue(new GitHubReadError("secret/repository/path.png"))
    const repoResponse = await POST(request({ source: "/secret/repository/path.png" }))
    expect(repoResponse.status).toBe(502)
    expect(await repoResponse.text()).not.toContain("secret/repository")
  })

  it("rejects malformed, cross-origin, unsafe-source, and non-JSON requests before resolution", async () => {
    expect((await POST(request({ extra: true }))).status).toBe(400)
    expect((await POST(request({}, "https://evil.test"))).status).toBe(403)
    expect((await POST(request({ source: "../secret.png" }))).status).toBe(400)
    expect(
      (
        await POST(
          new Request("https://app.repopress.test/api/preview/asset", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: "not json",
          }),
        )
      ).status,
    ).toBe(415)
    expect(fetchBoundedExternalImage).not.toHaveBeenCalled()
    expect(getFileForPublish).not.toHaveBeenCalled()
  })
})
