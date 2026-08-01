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
vi.mock("@/lib/preview/compatible-signing.server", () => ({
  CompatiblePreviewSigningUnavailableError: class CompatiblePreviewSigningUnavailableError extends Error {},
  signCompatiblePreviewResolution: vi.fn(),
}))

process.env.NEXT_PUBLIC_CONVEX_URL ||= "https://example.convex.cloud"

import { GitHubReadError, getBranchHeadSha, getFileForPublish } from "@/lib/github"
import {
  CompatiblePreviewSigningUnavailableError,
  signCompatiblePreviewResolution,
} from "@/lib/preview/compatible-signing.server"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"
import { POST } from "../route"

const BASE_SHA = "a".repeat(40)
const ENTRY_PATH = ".repopress/mdx-preview.tsx"
const ADAPTER_SOURCE = `
  import React from "react"
  import { PreviewBox } from "@repopress/preview"
  export const adapter = { components: { InfoBox: PreviewBox } }
`
const project = {
  _id: "project-1",
  userId: "tenant-1",
  repoOwner: "merry",
  repoName: "magic-mail",
  branch: "main",
  previewEntry: ENTRY_PATH,
}

function request(overrides: Record<string, unknown> = {}, options: { origin?: string; contentType?: string } = {}) {
  return new Request("https://app.repopress.test/api/preview/compatible", {
    method: "POST",
    headers: {
      Origin: options.origin ?? "https://app.repopress.test",
      "Content-Type": options.contentType ?? "application/json",
    },
    body: JSON.stringify({
      projectId: "project-1",
      filePath: "content/blog/post.mdx",
      baseCommitSha: BASE_SHA,
      snapshotVersion: 9,
      documentSource: "# Hello\n\n<InfoBox>Safe</InfoBox>",
      ...overrides,
    }),
  })
}

function signedResolution(input: Parameters<typeof signCompatiblePreviewResolution>[0]) {
  return {
    authority: {
      kind: "signed-preview-resolution" as const,
      algorithm: "ECDSA-P256-SHA256" as const,
      keyId: "preview-key-v1",
      approvalId: "approval-id",
      ...input.authority,
      rendererProfile: "static-inert-v1" as const,
      issuedAt: 1_750_000_000_000,
      expiresAt: 1_750_000_300_000,
      executableDigest: "b".repeat(64),
      signature: "c".repeat(86),
    },
    artifact: input.artifact,
  }
}

describe("POST /api/preview/compatible", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")
    vi.stubEnv("PREVIEW_APPROVAL_KEY_ID", "preview-key-v1")
    convexQueryMock.mockResolvedValue(project)
    vi.mocked(resolveRouteAuth).mockResolvedValue({
      actingUserId: "tenant-1",
      role: "owner",
      projectAccessToken: "project-token",
      githubToken: "gh-token",
    })
    vi.mocked(getBranchHeadSha).mockResolvedValue(BASE_SHA)
    vi.mocked(getFileForPublish).mockResolvedValue({
      status: "found",
      file: { content: ADAPTER_SOURCE, sha: "d".repeat(40), name: "mdx-preview.tsx", path: ENTRY_PATH },
    })
    vi.mocked(signCompatiblePreviewResolution).mockImplementation(async (input) => signedResolution(input))
  })

  it.each([
    [401, new RouteAuthError("Unauthorized", 401)],
    [403, new RouteAuthError('Forbidden: requires "editor" permission', 403)],
  ])("returns %s when project editor authorization fails", async (status, error) => {
    vi.mocked(resolveRouteAuth).mockRejectedValue(error)
    const response = await POST(request())
    expect(response.status).toBe(status)
    expect(getBranchHeadSha).not.toHaveBeenCalled()
  })

  it("returns 404 for a missing project", async () => {
    convexQueryMock.mockResolvedValue(null)
    const response = await POST(request())
    expect(response.status).toBe(404)
    expect(resolveRouteAuth).not.toHaveBeenCalled()
  })

  it("rejects a stale base commit before reading the adapter", async () => {
    vi.mocked(getBranchHeadSha).mockResolvedValue("e".repeat(40))
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect(getFileForPublish).not.toHaveBeenCalled()
    expect(signCompatiblePreviewResolution).not.toHaveBeenCalled()
  })

  it.each([
    ["missing preview entry", { ...project, previewEntry: undefined }],
    ["unsafe preview entry", { ...project, previewEntry: "../secret.tsx" }],
  ])("returns 422 for %s", async (_label, configuredProject) => {
    convexQueryMock.mockResolvedValue(configuredProject)
    expect((await POST(request())).status).toBe(422)
    expect(getFileForPublish).not.toHaveBeenCalled()
  })

  it("returns 422 when the pinned adapter is absent", async () => {
    vi.mocked(getFileForPublish).mockResolvedValue({ status: "absent" })
    expect((await POST(request())).status).toBe(422)
    expect(signCompatiblePreviewResolution).not.toHaveBeenCalled()
  })

  it.each([
    ['import Link from "next/link"', "unsupported imports"],
    ["x".repeat(256 * 1024 + 1), "oversized source"],
  ])("returns 422 for %s", async (content) => {
    vi.mocked(getFileForPublish).mockResolvedValue({
      status: "found",
      file: { content, sha: "d".repeat(40), name: "mdx-preview.tsx", path: ENTRY_PATH },
    })
    expect((await POST(request())).status).toBe(422)
    expect(signCompatiblePreviewResolution).not.toHaveBeenCalled()
  })

  it("does not sign after an ambiguous GitHub read and does not leak source or internal errors", async () => {
    vi.mocked(getFileForPublish).mockRejectedValue(new GitHubReadError(`upstream leaked ${ADAPTER_SOURCE}`))
    const response = await POST(request())
    const body = await response.text()
    expect(response.status).toBe(502)
    expect(signCompatiblePreviewResolution).not.toHaveBeenCalled()
    expect(body).not.toContain(ADAPTER_SOURCE)
    expect(body).not.toContain("upstream leaked")
  })

  it("returns 503 when the signing authority is unavailable", async () => {
    vi.mocked(signCompatiblePreviewResolution).mockRejectedValue(new CompatiblePreviewSigningUnavailableError())
    expect((await POST(request())).status).toBe(503)
  })

  it("returns a strict compatible result bound to the exact pinned artifact", async () => {
    const response = await POST(request())
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(body.previewResult).toMatchObject({
      fidelity: "compatible",
      status: "ready",
      snapshotVersion: 9,
      target: { kind: "sandboxed-iframe", url: "https://preview.repopress.test/preview/sandbox" },
    })
    expect(body.authority).toMatchObject({
      tenantId: "tenant-1",
      projectId: "project-1",
      baseCommit: BASE_SHA,
      snapshotVersion: 9,
    })
    expect(body.previewResult.sessionId).toBe(body.authority.sessionId)
    expect(body.authority.sessionId).toMatch(/^[A-Za-z0-9_-]{22}$/u)
    expect(getFileForPublish).toHaveBeenCalledWith("gh-token", "merry", "magic-mail", ENTRY_PATH, BASE_SHA)
    expect(signCompatiblePreviewResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact: expect.objectContaining({
          documentSource: "# Hello\n\n<InfoBox>Safe</InfoBox>",
          adapter: { entryPath: ENTRY_PATH, sources: { [ENTRY_PATH]: ADAPTER_SOURCE } },
        }),
        authority: body.authority,
        keyId: "preview-key-v1",
      }),
    )
    expect(JSON.parse(body.resolution).artifact.documentSource).toBe("# Hello\n\n<InfoBox>Safe</InfoBox>")
  })

  it("rejects malformed, cross-origin, and non-JSON requests before loading authority", async () => {
    expect((await POST(request({ extra: true }))).status).toBe(400)
    expect((await POST(request({}, { origin: "https://evil.test" }))).status).toBe(403)
    expect((await POST(request({}, { contentType: "text/plain" }))).status).toBe(415)
  })
})
