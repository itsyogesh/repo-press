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

const { dnsLookupMock } = vi.hoisted(() => ({
  dnsLookupMock: vi.fn(),
}))

vi.mock(import("node:dns/promises"), () => ({
  default: { lookup: dnsLookupMock },
  lookup: dnsLookupMock,
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

vi.mock("@/lib/studio/media-upload-shared", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studio/media-upload-shared")>(
    "@/lib/studio/media-upload-shared",
  )
  return {
    ...actual,
    uploadToConvexStorage: vi.fn().mockResolvedValue({ storageId: "storage_ext123" }),
  }
})

process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://example.convex.cloud"

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

function imageResponse() {
  return new Response(Uint8Array.from([1, 2, 3]), {
    status: 200,
    headers: { "content-type": "image/png" },
  })
}

describe("POST /api/media/download-external", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
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
    convexMutationMock.mockResolvedValue("media-op-1")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("downloads the image, stages Convex-backed media, and returns repoPath + previewUrl", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(imageResponse())

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      storage: "convex",
      repoPath: "/public/images/blog/creative-domain-ideas/creative-domain-ideas.png",
      staged: true,
      mediaOpId: "media-op-1",
    })
    expect(payload.previewUrl).toBe(
      "/api/media/resolve?projectId=project_123&path=%2Fpublic%2Fimages%2Fblog%2Fcreative-domain-ideas%2Fcreative-domain-ideas.png",
    )
    expect(fetchSpy).toHaveBeenCalledWith("https://images.example.com/creative-domain-ideas.png", {
      redirect: "manual",
    })
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        repoPath: "/public/images/blog/creative-domain-ideas/creative-domain-ideas.png",
        fileName: "creative-domain-ideas.png",
        mimeType: "image/png",
        sourceType: "convex",
        convexStorageId: "storage_ext123",
      }),
    )
  })

  it("threads sourceFilePath into staged external media ops", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(imageResponse())

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

  it("rejects non-image downloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    )

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("image")
  })

  it("rejects direct private-network targets before fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const response = await POST(
      buildRequest({
        ...baseBody(),
        url: "http://127.0.0.1/internal.png",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("public")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    "http://0.0.0.0/internal.png",
    "http://100.64.0.1/internal.png",
    "http://198.18.0.1/internal.png",
    "http://224.0.0.1/internal.png",
    "http://[::1]/internal.png",
    "http://[::ffff:127.0.0.1]/internal.png",
  ])("rejects non-global direct targets before fetching: %s", async (url) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const response = await POST(
      buildRequest({
        ...baseBody(),
        url,
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("public")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects redirects to private-network targets", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    )

    const response = await POST(buildRequest(baseBody()))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("public")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("rejects hostnames that resolve to private-network IPs", async () => {
    dnsLookupMock.mockResolvedValueOnce([{ address: "10.0.0.12", family: 4 }])
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const response = await POST(
      buildRequest({
        ...baseBody(),
        url: "http://metadata.google.internal/instance/image.png",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("public")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects hostnames that resolve to reserved IPs", async () => {
    dnsLookupMock.mockResolvedValueOnce([{ address: "100.64.0.12", family: 4 }])
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const response = await POST(
      buildRequest({
        ...baseBody(),
        url: "http://images.example.internal/image.png",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("public")
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
