import { beforeEach, describe, expect, it, vi } from "vitest"

const { convexQueryMock, convexActionMock, fetchAuthActionMock, resolveRouteAuthMock } = vi.hoisted(() => ({
  convexQueryMock: vi.fn(),
  convexActionMock: vi.fn(),
  fetchAuthActionMock: vi.fn(),
  resolveRouteAuthMock: vi.fn(),
}))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convexQueryMock
    action = convexActionMock
  },
}))

vi.mock("@/lib/auth-server", () => ({
  fetchAuthAction: fetchAuthActionMock,
  getGitHubToken: vi.fn().mockResolvedValue("github-token"),
}))

vi.mock("@/lib/github-permissions", () => ({
  getRepoRole: vi.fn().mockResolvedValue({ role: "editor" }),
}))

vi.mock("@/lib/project-access-token", () => ({
  mintServerQueryToken: vi.fn().mockResolvedValue("server-token"),
}))

vi.mock("@/lib/route-auth", () => ({
  resolveRouteAuth: resolveRouteAuthMock,
  RouteAuthError: class RouteAuthError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://example.convex.cloud"

import { POST } from "../route"

const BASE_SHA = "a".repeat(40)
const project = {
  _id: "project_1",
  userId: "owner_1",
  repoOwner: "acme",
  repoName: "docs",
  branch: "main",
  contentRoot: "content",
}

describe("POST /api/github/sync-titles Convex action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexQueryMock.mockResolvedValue(project)
    convexActionMock.mockResolvedValue(undefined)
    fetchAuthActionMock.mockResolvedValue(undefined)
    resolveRouteAuthMock.mockResolvedValue({
      actingUserId: "editor_1",
      role: "editor",
      projectAccessToken: "project-token",
      githubToken: "github-token",
    })
  })

  it("invokes the action with propagated auth and no caller repository coordinates", async () => {
    const response = await POST(
      new Request("https://repopress.test/api/github/sync-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "project_1",
          owner: "acme",
          repo: "docs",
          branch: "main",
          readRef: BASE_SHA,
          files: [{ path: "content/guide.mdx", sha: "f".repeat(40) }],
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(resolveRouteAuthMock).toHaveBeenCalledWith(project, "editor")
    expect(fetchAuthActionMock).toHaveBeenCalledWith(expect.anything(), {
      projectId: "project_1",
      readRef: BASE_SHA,
      files: [{ path: "guide.mdx", sha: "f".repeat(40) }],
      githubToken: "github-token",
    })
    expect(convexActionMock).not.toHaveBeenCalled()
  })
})
