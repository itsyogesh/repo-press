import { beforeEach, describe, expect, it, vi } from "vitest"

const { convexQueryMock, convexMutationMock, resolveRouteAuthMock, createGitHubClientMock, recoverMock } = vi.hoisted(
  () => ({
    convexQueryMock: vi.fn(),
    convexMutationMock: vi.fn(),
    resolveRouteAuthMock: vi.fn(),
    createGitHubClientMock: vi.fn(),
    recoverMock: vi.fn(),
  }),
)

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convexQueryMock
    mutation = convexMutationMock
  },
}))
vi.mock("@/lib/route-auth", () => ({
  resolveRouteAuth: resolveRouteAuthMock,
  RouteAuthError: class RouteAuthError extends Error {
    status = 401
  },
}))
vi.mock("@/lib/github", () => ({ createGitHubClient: createGitHubClientMock }))
vi.mock("@/lib/project-access-token", () => ({ mintServerQueryToken: vi.fn().mockResolvedValue("server-token") }))
vi.mock("@/app/api/github/publish-ops/route", () => ({ recoverPublishAttempt: recoverMock }))

import { POST } from "../route"

const project = {
  _id: "project_1",
  repoOwner: "acme",
  repoName: "docs",
  branch: "main",
  contentRoot: "content",
}

function request(body: Record<string, unknown>, origin = "http://localhost:3001") {
  return new Request("http://localhost:3001/api/github/pr-status/sync", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  })
}

const command = {
  projectId: "project_1",
  laneId: "lane_1",
  prNumber: 42,
  headBranch: "repopress/start",
  baseBranch: "main",
}

function mockPr(overrides: Record<string, unknown> = {}) {
  createGitHubClientMock.mockReturnValue({
    rest: {
      pulls: {
        get: vi.fn().mockResolvedValue({
          data: {
            state: "closed",
            merged: true,
            merge_commit_sha: "a".repeat(40),
            head: { ref: "repopress/start", repo: { full_name: "acme/docs" } },
            base: { ref: "main", repo: { full_name: "acme/docs" } },
            ...overrides,
          },
        }),
      },
    },
  })
}

describe("POST /api/github/pr-status/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveRouteAuthMock.mockResolvedValue({
      actingUserId: "user_1",
      projectAccessToken: undefined,
      githubToken: "gh-token",
    })
    mockPr()
    convexQueryMock.mockResolvedValueOnce(project).mockResolvedValueOnce(null)
    convexMutationMock.mockResolvedValue({ verificationState: "pending" })
  })

  it("records server-read merge authority and starts zero-editor-change verification", async () => {
    const response = await POST(request(command))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        laneId: "lane_1",
        projectId: "project_1",
        mergeCommitSha: "a".repeat(40),
        baseRepoFullName: "acme/docs",
        baseBranch: "main",
        headRepoFullName: "acme/docs",
        headBranch: "repopress/start",
        serverQueryToken: "server-token",
      }),
    )
    expect(recoverMock).not.toHaveBeenCalled()
    expect(body).toEqual(expect.objectContaining({ merged: true, verificationPending: true }))
  })

  it("drives exact-tree attempt recovery from status sync without a publish click", async () => {
    const attempt = { _id: "attempt_1", projectId: "project_1" }
    convexQueryMock.mockReset().mockResolvedValueOnce(project).mockResolvedValueOnce(attempt)
    recoverMock.mockResolvedValue({
      handled: true,
      response: Response.json({ ok: true, cleanupPending: true }),
    })

    const response = await POST(request(command))

    expect(response.status).toBe(200)
    expect(recoverMock).toHaveBeenCalledWith(
      expect.objectContaining({ attempt, projectId: "project_1", token: "gh-token", owner: "acme", repo: "docs" }),
    )
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ verificationPending: true }))
  })

  it("rejects base or head identity mismatch without recording lifecycle state", async () => {
    mockPr({ base: { ref: "release", repo: { full_name: "acme/docs" } } })

    const response = await POST(request(command))

    expect(response.status).toBe(409)
    expect(convexMutationMock).not.toHaveBeenCalled()
    expect(recoverMock).not.toHaveBeenCalled()
  })

  it("rejects a cross-origin state-changing request before GitHub or Convex writes", async () => {
    const response = await POST(request(command, "https://attacker.example"))

    expect(response.status).toBe(403)
    expect(createGitHubClientMock).not.toHaveBeenCalled()
    expect(convexMutationMock).not.toHaveBeenCalled()
  })
})
