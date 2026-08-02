import { beforeEach, describe, expect, it, vi } from "vitest"
import { getGitHubToken } from "@/lib/auth-server"
import { getFile } from "@/lib/github"
import { GET } from "../route"

vi.mock("@/lib/auth-server", () => ({ getGitHubToken: vi.fn() }))
vi.mock("@/lib/github", () => ({ getFile: vi.fn() }))

describe("GET /api/github/file immutable read authority", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getGitHubToken).mockResolvedValue("github-token")
    vi.mocked(getFile).mockResolvedValue({
      path: "content/guide.mdx",
      name: "guide.mdx",
      sha: "f".repeat(40),
      content: "# Base snapshot",
    })
  })

  it("forwards the captured commit ref even when a mutable branch is also present", async () => {
    const baseSha = "a".repeat(40)
    const response = await GET(
      new Request(
        `https://repopress.test/api/github/file?owner=acme&repo=docs&path=content%2Fguide.mdx&ref=${baseSha}&branch=advanced`,
      ),
    )

    expect(response.status).toBe(200)
    expect(getFile).toHaveBeenCalledWith("github-token", "acme", "docs", "content/guide.mdx", baseSha)
  })
})
