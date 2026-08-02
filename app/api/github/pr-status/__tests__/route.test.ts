import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Hoisted mocks ────────────────────────────────────────────────

const { getGitHubTokenMock } = vi.hoisted(() => ({
  getGitHubTokenMock: vi.fn(),
}))

vi.mock("@/lib/auth-server", () => ({
  getGitHubToken: getGitHubTokenMock,
}))

const { createGitHubClientMock } = vi.hoisted(() => ({
  createGitHubClientMock: vi.fn(),
}))

vi.mock("@/lib/github", () => ({
  createGitHubClient: createGitHubClientMock,
}))

// ── Import after mocks ──────────────────────────────────────────

import { GET } from "../route"

// ── Helpers ──────────────────────────────────────────────────────

const TOKEN = "ghp_test_token"

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:3001/api/github/pr-status")
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return new Request(url.toString())
}

function mockOctokit(prData: {
  state: string
  merged: boolean
  merge_commit_sha?: string | null
  head?: { ref: string; repo: { full_name: string } | null }
  base?: { ref: string; repo: { full_name: string } | null }
}) {
  createGitHubClientMock.mockReturnValue({
    rest: {
      pulls: {
        get: vi.fn().mockResolvedValue({ data: prData }),
      },
    },
  })
}

function mockOctokitError(status: number) {
  createGitHubClientMock.mockReturnValue({
    rest: {
      pulls: {
        get: vi.fn().mockRejectedValue({ status }),
      },
    },
  })
}

// ── Tests ────────────────────────────────────────────────────────

describe("GET /api/github/pr-status", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGitHubTokenMock.mockResolvedValue(TOKEN)
    mockOctokit({
      state: "open",
      merged: false,
      merge_commit_sha: null,
      head: { ref: "repopress/start", repo: { full_name: "acme/docs" } },
      base: { ref: "main", repo: { full_name: "acme/docs" } },
    })
  })

  // ── Auth ──

  it("returns 401 when not authenticated", async () => {
    getGitHubTokenMock.mockResolvedValue(null)

    const res = await GET(makeRequest({ owner: "acme", repo: "docs", prNumber: "42" }))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  // ── Param validation ──

  it("returns 400 when owner is missing", async () => {
    const res = await GET(makeRequest({ repo: "docs", prNumber: "42" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when repo is missing", async () => {
    const res = await GET(makeRequest({ owner: "acme", prNumber: "42" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when prNumber is missing", async () => {
    const res = await GET(makeRequest({ owner: "acme", repo: "docs" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for non-numeric prNumber", async () => {
    const res = await GET(makeRequest({ owner: "acme", repo: "docs", prNumber: "abc" }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain("positive integer")
  })

  it("returns 400 for zero prNumber", async () => {
    const res = await GET(makeRequest({ owner: "acme", repo: "docs", prNumber: "0" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for negative prNumber", async () => {
    const res = await GET(makeRequest({ owner: "acme", repo: "docs", prNumber: "-5" }))
    expect(res.status).toBe(400)
  })

  // ── Happy path ──

  it("returns state and merged for an open PR", async () => {
    mockOctokit({
      state: "open",
      merged: false,
      merge_commit_sha: null,
      head: { ref: "repopress/start", repo: { full_name: "acme/docs" } },
      base: { ref: "main", repo: { full_name: "acme/docs" } },
    })

    const res = await GET(makeRequest({ owner: "acme", repo: "docs", prNumber: "42" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      state: "open",
      merged: false,
      mergeCommitSha: null,
      headRef: "repopress/start",
      headRepoFullName: "acme/docs",
      baseRef: "main",
      baseRepoFullName: "acme/docs",
    })
  })

  it("returns state and merged for a merged PR", async () => {
    mockOctokit({
      state: "closed",
      merged: true,
      merge_commit_sha: "a".repeat(40),
      head: { ref: "repopress/start", repo: { full_name: "acme/docs" } },
      base: { ref: "main", repo: { full_name: "acme/docs" } },
    })

    const res = await GET(makeRequest({ owner: "acme", repo: "docs", prNumber: "99" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      state: "closed",
      merged: true,
      mergeCommitSha: "a".repeat(40),
      headRef: "repopress/start",
      headRepoFullName: "acme/docs",
      baseRef: "main",
      baseRepoFullName: "acme/docs",
    })
  })

  it.each([
    null,
    "not-a-sha",
    "A".repeat(40),
  ])("fails closed when a merged PR has malformed merge authority: %s", async (mergeCommitSha) => {
    mockOctokit({
      state: "closed",
      merged: true,
      merge_commit_sha: mergeCommitSha,
      head: { ref: "repopress/start", repo: { full_name: "acme/docs" } },
      base: { ref: "main", repo: { full_name: "acme/docs" } },
    })

    const res = await GET(makeRequest({ owner: "acme", repo: "docs", prNumber: "99" }))

    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.stringContaining("merge commit") }),
    )
  })

  // ── Error handling ──

  it("returns 404 when GitHub reports PR not found", async () => {
    mockOctokitError(404)

    const res = await GET(makeRequest({ owner: "acme", repo: "docs", prNumber: "999" }))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe("PR not found")
  })

  it("returns 500 for unexpected GitHub errors", async () => {
    createGitHubClientMock.mockReturnValue({
      rest: {
        pulls: {
          get: vi.fn().mockRejectedValue(new Error("rate limit exceeded")),
        },
      },
    })

    const res = await GET(makeRequest({ owner: "acme", repo: "docs", prNumber: "42" }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe("Failed to fetch PR status")
  })
})
