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

vi.mock("@/lib/github", () => ({
  batchCommit: vi.fn(),
  createBranch: vi.fn(),
  createGitHubClient: vi.fn(),
  createPullRequest: vi.fn(),
  getFile: vi.fn(),
}))

vi.mock("@/lib/github-permissions", () => ({
  getRepoRole: vi.fn(),
  probeRepoReadAccess: vi.fn().mockResolvedValue(null),
  roleAtLeast: (actual: string, minimum: string) => {
    const h: Record<string, number> = { owner: 3, editor: 2, viewer: 1 }
    return (h[actual] ?? 0) >= (h[minimum] ?? 0)
  },
}))

process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://example.convex.cloud"

import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { batchCommit, createGitHubClient, getFile } from "@/lib/github"
import { getRepoRole } from "@/lib/github-permissions"
import { POST } from "../route"

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/github/publish-ops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/github/publish-ops", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexQueryMock.mockReset()
    convexMutationMock.mockReset()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    vi.mocked(getGitHubToken).mockResolvedValue("gh-token")
    vi.mocked(fetchAuthQuery!).mockResolvedValue({ _id: "user_owner" } as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_owner")
    vi.mocked(getRepoRole).mockResolvedValue({ role: "owner", defaultBranch: "main", defaultBranchInferred: false })
    vi.mocked(createGitHubClient).mockReturnValue({
      repos: {
        get: vi.fn().mockResolvedValue({}),
      },
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({ data: { login: "user_owner" } }),
      },
    } as never)
    vi.mocked(batchCommit).mockResolvedValue({ commitSha: "commit-sha-1" } as never)
    vi.mocked(getFile).mockResolvedValue({ sha: "new-sha-1" } as never)

    convexQueryMock
      .mockResolvedValueOnce({
        _id: "project_123",
        userId: "user_owner",
        repoOwner: "acme",
        repoName: "docs-site",
        branch: "main",
        contentRoot: "content",
      })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          _id: "doc_1",
          filePath: "posts/hello.mdx",
          body: "# Hello",
          frontmatter: { title: "Hello" },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
      })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("ignores a spoofed userId from the request body and uses the authenticated session instead", async () => {
    const response = await POST(
      buildRequest({
        projectId: "project_123",
        userId: "attacker_controlled_user",
        title: "Publish docs",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(fetchAuthQuery).toHaveBeenCalled()
    expect(batchCommit).toHaveBeenCalled()
  })

  it("rejects publishing when the authenticated user has no repo access", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue({ _id: "different_user" } as never)
    vi.mocked(getRepoRole).mockResolvedValue({ role: null, defaultBranch: null, defaultBranchInferred: false })
    convexQueryMock.mockReset()
    convexQueryMock.mockResolvedValue({
      _id: "project_123",
      userId: "user_owner",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
      contentRoot: "content",
    })

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        title: "Publish docs",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toContain("no access")
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("rejects PAT-mode publishing when the PAT user has no repo access", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("different_user")
    vi.mocked(getRepoRole).mockResolvedValue({ role: null, defaultBranch: null, defaultBranchInferred: false })

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        title: "Publish docs",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toContain("no access")
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("allows PAT-mode publishing when the PAT resolves to the project owner", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_owner")

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        title: "Publish docs",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(batchCommit).toHaveBeenCalled()
  })
})
