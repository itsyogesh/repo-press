import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { convexQueryMock, convexActionMock } = vi.hoisted(() => ({
  convexQueryMock: vi.fn(),
  convexActionMock: vi.fn(),
}))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convexQueryMock
    action = convexActionMock
  },
}))

vi.mock("@/lib/auth-server", () => ({
  fetchAuthQuery: vi.fn(),
  getGitHubToken: vi.fn(),
  getPatAuthUserId: vi.fn(),
}))

vi.mock("@/lib/github-permissions", () => ({
  getRepoRole: vi.fn(),
  probeRepoReadAccess: vi.fn(),
}))

vi.mock("@/lib/project-access-token", () => ({
  mintServerQueryToken: vi.fn().mockResolvedValue("server-query-token"),
}))

process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://example.convex.cloud"

import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { getRepoRole, probeRepoReadAccess } from "@/lib/github-permissions"
import { POST } from "../route"

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/github/sync-titles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/github/sync-titles", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    vi.mocked(getGitHubToken).mockResolvedValue("gh-token")
    vi.mocked(fetchAuthQuery!).mockResolvedValue({ _id: "user_1" } as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_1")
    vi.mocked(getRepoRole).mockResolvedValue({ role: null, defaultBranch: null, defaultBranchInferred: false })
    vi.mocked(probeRepoReadAccess).mockResolvedValue("viewer")
    convexQueryMock.mockResolvedValue({
      _id: "project_123",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
      userId: "owner_1",
    })
    convexActionMock.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("allows org collaborators through fallback repo access checks when repo permissions are hidden", async () => {
    const response = await POST(
      buildRequest({
        projectId: "project_123",
        owner: "acme",
        repo: "docs-site",
        branch: "main",
        files: [{ path: "content/post.mdx", title: "Title" }],
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(convexActionMock).toHaveBeenCalled()
  })
})
