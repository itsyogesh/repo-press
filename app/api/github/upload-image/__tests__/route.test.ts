import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth-server", () => ({
  getGitHubToken: vi.fn(),
}))

vi.mock("@/lib/github", () => ({
  createGitHubClient: vi.fn(),
}))

import { getGitHubToken } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"
import { POST } from "../route"

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/github/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function baseBody() {
  return {
    owner: "acme",
    repo: "docs-site",
    path: "public/images/hero.png",
    content: Buffer.from("image-bytes").toString("base64"),
    message: "Upload hero image",
    branch: "main",
  }
}

describe("POST /api/github/upload-image", () => {
  const createOrUpdateFileContents = vi.fn().mockResolvedValue({
    data: {
      content: { sha: "blob-sha-1", html_url: "https://github.com/acme/docs-site/blob/main/public/images/hero.png" },
      commit: { sha: "commit-sha-1" },
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getGitHubToken).mockResolvedValue("gh-token")
    vi.mocked(createGitHubClient).mockReturnValue({
      repos: { createOrUpdateFileContents },
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("rejects non-image extensions before calling GitHub", async () => {
    const response = await POST(
      buildRequest({
        ...baseBody(),
        path: "public/images/hero.txt",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("image")
    expect(createOrUpdateFileContents).not.toHaveBeenCalled()
  })

  it("rejects path traversal attempts before calling GitHub", async () => {
    const response = await POST(
      buildRequest({
        ...baseBody(),
        path: "../.github/workflows/deploy.png",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("path")
    expect(createOrUpdateFileContents).not.toHaveBeenCalled()
  })

  it("rejects payloads larger than 10MB decoded", async () => {
    const oversized = "A".repeat(10 * 1024 * 1024 * 2)

    const response = await POST(
      buildRequest({
        ...baseBody(),
        content: oversized,
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(413)
    expect(payload.error).toContain("10MB")
    expect(createOrUpdateFileContents).not.toHaveBeenCalled()
  })
})
