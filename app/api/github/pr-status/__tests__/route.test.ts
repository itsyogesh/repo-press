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

function mockOctokit(prData: { state: string; merged: boolean }) {
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
    mockOctokit({ state: "open", merged: false })
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
    mockOctokit({ state: "open", merged: false })

    const res = await GET(makeRequest({ owner: "acme", repo: "docs", prNumber: "42" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ state: "open", merged: false })
  })

  it("returns state and merged for a merged PR", async () => {
    mockOctokit({ state: "closed", merged: true })

    const res = await GET(makeRequest({ owner: "acme", repo: "docs", prNumber: "99" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ state: "closed", merged: true })
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
