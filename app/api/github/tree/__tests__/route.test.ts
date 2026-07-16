import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getGitHubToken } from "@/lib/auth-server"
import { getContentTree } from "@/lib/github"
import { GET } from "../route"

vi.mock("@/lib/auth-server", () => ({ getGitHubToken: vi.fn() }))
vi.mock("@/lib/github", () => ({ getContentTree: vi.fn() }))

describe("GET /api/github/tree immutable read authority", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getGitHubToken).mockResolvedValue("github-token")
    vi.mocked(getContentTree).mockResolvedValue([])
  })

  it("forwards the captured commit ref instead of a mutable branch", async () => {
    const baseSha = "a".repeat(40)
    const request = new NextRequest(
      `https://repopress.test/api/github/tree?owner=acme&repo=docs&ref=${baseSha}&contentRoot=content`,
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(getContentTree).toHaveBeenCalledWith("github-token", "acme", "docs", baseSha, "content")
  })
})
