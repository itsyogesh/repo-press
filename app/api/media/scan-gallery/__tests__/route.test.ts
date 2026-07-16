import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { convexQueryMock, convexActionMock, fetchAuthActionMock, resolveRouteAuthMock, resolveRouteCredentialMock } =
  vi.hoisted(() => ({
    convexQueryMock: vi.fn(),
    convexActionMock: vi.fn(),
    fetchAuthActionMock: vi.fn(),
    resolveRouteAuthMock: vi.fn(),
    resolveRouteCredentialMock: vi.fn(),
  }))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convexQueryMock
    action = convexActionMock
  },
}))

vi.mock("@/lib/auth-server", () => ({
  fetchAuthAction: fetchAuthActionMock,
}))

vi.mock("@/lib/project-access-token", () => ({
  mintServerQueryToken: vi.fn().mockResolvedValue("server-token"),
}))

vi.mock("@/lib/route-auth", () => ({
  resolveRouteAuth: resolveRouteAuthMock,
  resolveRouteGitHubCredential: resolveRouteCredentialMock,
  RouteAuthError: class RouteAuthError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://example.convex.cloud"

import { RouteAuthError } from "@/lib/route-auth"
import { POST } from "../route"

const BASE_SHA = "b".repeat(40)
const project = {
  _id: "project_1",
  userId: "owner_1",
  repoOwner: "acme",
  repoName: "docs",
  branch: "main",
  contentRoot: "content",
}

describe("POST /api/media/scan-gallery Convex action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexQueryMock.mockResolvedValue(project)
    convexActionMock.mockResolvedValue({ found: 0, inserted: 0, updated: 0, truncated: false })
    fetchAuthActionMock.mockResolvedValue({ found: 0, inserted: 0, updated: 0, truncated: false })
    resolveRouteAuthMock.mockResolvedValue({
      actingUserId: "editor_1",
      role: "editor",
      projectAccessToken: "project-token",
      githubToken: "github-token",
    })
    resolveRouteCredentialMock.mockResolvedValue({ githubToken: "github-token" })
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => vi.restoreAllMocks())

  it("invokes the gallery action with propagated auth and no caller identity or repository coordinates", async () => {
    const response = await POST(
      new Request("https://repopress.test/api/media/scan-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "project_1",
          owner: "acme",
          repo: "docs",
          branch: "main",
          readRef: BASE_SHA,
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(resolveRouteCredentialMock).toHaveBeenCalledOnce()
    expect(resolveRouteAuthMock).not.toHaveBeenCalled()
    expect(fetchAuthActionMock).toHaveBeenCalledWith(expect.anything(), {
      projectId: "project_1",
      readRef: BASE_SHA,
      githubToken: "github-token",
    })
    expect(convexActionMock).not.toHaveBeenCalled()
  })

  it("reaches the action quota without a route-level repository permission check", async () => {
    fetchAuthActionMock.mockRejectedValue(new Error("Rate limit exceeded"))

    const response = await POST(
      new Request("https://repopress.test/api/media/scan-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "project_1",
          owner: "acme",
          repo: "docs",
          branch: "main",
          readRef: BASE_SHA,
        }),
      }),
    )

    expect(response.status).toBe(500)
    expect(fetchAuthActionMock).toHaveBeenCalledOnce()
    expect(resolveRouteCredentialMock).toHaveBeenCalledOnce()
    expect(resolveRouteAuthMock).not.toHaveBeenCalled()
  })

  it("rejects a missing route credential before resolving a project", async () => {
    resolveRouteCredentialMock.mockRejectedValue(new RouteAuthError("Unauthorized", 401))

    const response = await POST(new Request("https://repopress.test/api/media/scan-gallery", { method: "POST" }))

    expect(response.status).toBe(401)
    expect(convexQueryMock).not.toHaveBeenCalled()
    expect(fetchAuthActionMock).not.toHaveBeenCalled()
  })

  it("rejects request repository coordinates that differ from the canonical project", async () => {
    const response = await POST(
      new Request("https://repopress.test/api/media/scan-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "project_1",
          owner: "attacker",
          repo: "other",
          branch: "main",
          readRef: BASE_SHA,
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(fetchAuthActionMock).not.toHaveBeenCalled()
  })
})
