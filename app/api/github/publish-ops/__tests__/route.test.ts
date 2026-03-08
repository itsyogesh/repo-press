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

process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://example.convex.cloud"

import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { batchCommit, createGitHubClient, getFile } from "@/lib/github"
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
    vi.mocked(fetchAuthQuery).mockResolvedValue({ _id: "user_owner" } as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_owner")
    vi.mocked(createGitHubClient).mockReturnValue({
      repos: {
        get: vi.fn().mockResolvedValue({}),
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

  it("rejects publishing when the authenticated user does not own the project", async () => {
    vi.mocked(fetchAuthQuery).mockResolvedValue({ _id: "different_user" } as never)
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
    expect(payload.error).toBe("Unauthorized")
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("rejects PAT-mode publishing when the PAT does not resolve to the project owner", async () => {
    vi.mocked(fetchAuthQuery).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("different_user")

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        title: "Publish docs",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toBe("Unauthorized")
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("allows PAT-mode publishing when the PAT resolves to the project owner", async () => {
    vi.mocked(fetchAuthQuery).mockResolvedValue(null as never)
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
