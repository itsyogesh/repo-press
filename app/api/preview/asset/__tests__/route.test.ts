import sharp from "sharp"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { convexMutationMock, convexQueryMock } = vi.hoisted(() => ({
  convexMutationMock: vi.fn(),
  convexQueryMock: vi.fn(),
}))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convexQueryMock
    mutation = convexMutationMock
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
  getFileBytesForPublish: vi.fn(),
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

import { GitHubReadError, getBranchHeadSha, getFileBytesForPublish } from "@/lib/github"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"
import { detectImageMimeType, ExternalImageError, fetchBoundedExternalImage } from "@/lib/server/external-image"
import { POST } from "../route"

const BASE_SHA = "a".repeat(40)
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=", "base64"),
)
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

function animatedGif(frameCount: number, width = 1, height = 1) {
  const bytes: number[] = []
  const push = (...values: number[]) => bytes.push(...values)
  push(...Buffer.from("GIF89a"))
  push(width & 0xff, width >> 8, height & 0xff, height >> 8, 0x80, 0, 0, 0, 0, 0, 255, 255, 255)
  for (let index = 0; index < frameCount; index += 1) {
    push(0x21, 0xf9, 4, 0, 1, 0, 0, 0)
    push(0x2c, 0, 0, 0, 0, width & 0xff, width >> 8, height & 0xff, height >> 8, 0)
    push(2, 2, 0x44, 1, 0)
  }
  push(0x3b)
  return Uint8Array.from(bytes)
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngWithDimensions(width: number, height: number) {
  const bytes = Uint8Array.from(PNG)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  view.setUint32(29, crc32(bytes.subarray(12, 29)))
  return bytes
}

async function compressedImageWithOversizedCanvas(format: "webp" | "avif") {
  const bytes = await sharp({
    create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    [format]()
    .toBuffer()
  if (format === "webp") {
    const signatureOffset = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]))
    bytes.writeUInt16LE(10_000, signatureOffset + 3)
    bytes.writeUInt16LE(10_000, signatureOffset + 5)
  } else {
    const imageSpatialExtentsOffset = bytes.indexOf(Buffer.from("ispe"))
    bytes.writeUInt32BE(10_000, imageSpatialExtentsOffset + 8)
    bytes.writeUInt32BE(10_000, imageSpatialExtentsOffset + 12)
  }
  return bytes
}

describe("POST /api/preview/asset", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexQueryMock.mockResolvedValue(project)
    convexMutationMock.mockImplementation(async (_reference, args) => {
      if ("actualBytes" in args) return { settled: true }
      if ("reservationId" in args) return { aborted: true }
      return { reserved: true, reservationId: "reservation-1" }
    })
    vi.mocked(resolveRouteAuth).mockResolvedValue({
      actingUserId: "tenant-1",
      role: "owner",
      projectAccessToken: "project-token",
      githubToken: "gh-token",
    })
    vi.mocked(getBranchHeadSha).mockResolvedValue(BASE_SHA)
    vi.mocked(detectImageMimeType).mockReturnValue("image/png")
    vi.mocked(fetchBoundedExternalImage).mockResolvedValue({ bytes: PNG, mimeType: "image/png" })
    vi.mocked(getFileBytesForPublish).mockResolvedValue({
      status: "found",
      file: { bytes: PNG, sha: "b".repeat(40), name: "cover.png", path: "cover.png" },
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
    expect(getFileBytesForPublish).not.toHaveBeenCalled()
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reservationId: "reservation-1" }),
    )
  })

  it.each([
    "attempt-limit",
    "concurrency-limit",
    "byte-limit",
  ] as const)("rejects a direct authenticated request when the durable budget reports %s", async (reason) => {
    convexMutationMock.mockResolvedValueOnce({ reserved: false, reason })

    const response = await POST(request())

    expect(response.status).toBe(429)
    expect(getBranchHeadSha).not.toHaveBeenCalled()
    expect(fetchBoundedExternalImage).not.toHaveBeenCalled()
    expect(await response.json()).toEqual({ error: "Preview asset unavailable" })
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })

  it("fails closed and attempts cleanup when durable settlement is uncertain", async () => {
    convexMutationMock
      .mockResolvedValueOnce({ reserved: true, reservationId: "reservation-1" })
      .mockRejectedValueOnce(new Error("settle transport uncertain"))
      .mockResolvedValueOnce({ aborted: true })

    const response = await POST(request())

    expect(response.status).toBe(503)
    expect(convexMutationMock).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.objectContaining({ reservationId: "reservation-1" }),
    )
    expect(await response.json()).toEqual({ error: "Preview asset unavailable" })
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
      mimePolicy: {
        kind: "strict",
        allowedMimeTypes: new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]),
      },
    })
  })

  it.each([
    ["images/cover.png", "content/blog/post/images/cover.png"],
    ["./images/cover.png", "content/blog/post/images/cover.png"],
    ["/public/images/cover.png", "public/images/cover.png"],
  ])("reads repository source %s at the exact pinned commit", async (source, repoPath) => {
    const response = await POST(request({ source }))
    expect(response.status).toBe(200)
    expect(getFileBytesForPublish).toHaveBeenCalledWith(
      "gh-token",
      "merry",
      "magic-mail",
      repoPath,
      BASE_SHA,
      4 * 1024 * 1024,
    )
    expect(fetchBoundedExternalImage).not.toHaveBeenCalled()
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
  })

  it("returns an opaque 404 when a repository image is absent", async () => {
    vi.mocked(getFileBytesForPublish).mockResolvedValue({ status: "absent" })
    const response = await POST(request({ source: "/public/images/missing.png" }))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "Preview asset unavailable" })
  })

  it("fails closed when a typed repository read does not expose raw bytes", async () => {
    vi.mocked(getFileBytesForPublish).mockResolvedValue({
      status: "found",
      file: { bytes: undefined, sha: "b".repeat(40), name: "cover.png", path: "public/cover.png" },
    } as never)
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

  it("rejects a compressed image whose decoded canvas exceeds the workload bound", async () => {
    vi.mocked(fetchBoundedExternalImage).mockResolvedValue({
      bytes: pngWithDimensions(10_000, 10_000),
      mimeType: "image/png",
    })

    const response = await POST(request())

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: "Preview asset unavailable" })
  })

  it.each([
    ["webp", "image/webp"],
    ["avif", "image/avif"],
  ] as const)("rejects a compressed %s whose declared canvas exceeds the workload bound", async (format, mimeType) => {
    const bytes = await compressedImageWithOversizedCanvas(format)
    vi.mocked(detectImageMimeType).mockReturnValue(mimeType)
    vi.mocked(fetchBoundedExternalImage).mockResolvedValue({ bytes, mimeType })

    const response = await POST(request({ source: `https://images.example.test/cover.${format}` }))

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: "Preview asset unavailable" })
  })

  it("rejects an animation whose frame count exceeds the workload bound", async () => {
    const bytes = animatedGif(17)
    vi.mocked(detectImageMimeType).mockReturnValue("image/gif")
    vi.mocked(fetchBoundedExternalImage).mockResolvedValue({ bytes, mimeType: "image/gif" })

    const response = await POST(request())

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: "Preview asset unavailable" })
  })

  it("accepts an animation within the frame and aggregate workload bounds", async () => {
    const bytes = animatedGif(2)
    vi.mocked(detectImageMimeType).mockReturnValue("image/gif")
    vi.mocked(fetchBoundedExternalImage).mockResolvedValue({ bytes, mimeType: "image/gif" })

    const response = await POST(request())

    expect(response.status).toBe(200)
  })

  it("rejects an animation whose aggregate decoded pixels exceed the workload bound", async () => {
    const bytes = animatedGif(2, 5_000, 4_000)
    vi.mocked(detectImageMimeType).mockReturnValue("image/gif")
    vi.mocked(fetchBoundedExternalImage).mockResolvedValue({ bytes, mimeType: "image/gif" })

    const response = await POST(request())

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: "Preview asset unavailable" })
  })

  it.each([
    ["jpeg", "image/jpeg"],
    ["webp", "image/webp"],
    ["avif", "image/avif"],
  ] as const)("accepts a safe %s workload", async (format, mimeType) => {
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      [format]()
      .toBuffer()
    vi.mocked(detectImageMimeType).mockReturnValue(mimeType)
    vi.mocked(fetchBoundedExternalImage).mockResolvedValue({ bytes, mimeType })

    const response = await POST(request({ source: `https://images.example.test/cover.${format}` }))

    expect(response.status).toBe(200)
  })

  it("rejects declared image MIME that does not match the decoded format", async () => {
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer()
    vi.mocked(detectImageMimeType).mockReturnValue("image/png")
    vi.mocked(fetchBoundedExternalImage).mockResolvedValue({ bytes, mimeType: "image/png" })

    const response = await POST(request())

    expect(response.status).toBe(415)
  })

  it("rejects malformed image bytes even when a MIME sniffer is fooled", async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    vi.mocked(fetchBoundedExternalImage).mockResolvedValue({ bytes, mimeType: "image/png" })

    const response = await POST(request())

    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({ error: "Preview asset unavailable" })
    expect(convexMutationMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ reservationId: "reservation-1" }),
    )
  })

  it("aborts the durable reservation after an external fetch failure", async () => {
    vi.mocked(fetchBoundedExternalImage).mockRejectedValue(new ExternalImageError("upstream", "unavailable"))

    const response = await POST(request())

    expect(response.status).toBe(502)
    expect(convexMutationMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ reservationId: "reservation-1" }),
    )
  })

  it("aborts the durable reservation after a repository read failure", async () => {
    vi.mocked(getFileBytesForPublish).mockRejectedValue(new GitHubReadError("unavailable"))

    const response = await POST(request({ source: "/public/cover.png" }))

    expect(response.status).toBe(502)
    expect(convexMutationMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ reservationId: "reservation-1" }),
    )
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

    vi.mocked(getFileBytesForPublish).mockRejectedValue(new GitHubReadError("secret/repository/path.png"))
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
    expect(getFileBytesForPublish).not.toHaveBeenCalled()
  })
})
