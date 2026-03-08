import { beforeEach, describe, expect, it } from "vitest"
import {
  mintGitHubAccountLookupToken,
  mintProjectAccessToken,
  verifyGitHubAccountLookupToken,
  verifyProjectAccessToken,
} from "../project-access-token"

describe("project access token", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret"
  })

  it("round-trips a valid token payload", async () => {
    const token = await mintProjectAccessToken({
      projectId: "project_1",
      userId: "user_1",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
    })

    const payload = await verifyProjectAccessToken(token)

    expect(payload).toMatchObject({
      projectId: "project_1",
      userId: "user_1",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
    })
  })

  it("rejects tampered tokens", async () => {
    const token = await mintProjectAccessToken({
      projectId: "project_1",
      userId: "user_1",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
    })

    const tampered = token.replace("project_1", "project_2")

    await expect(verifyProjectAccessToken(tampered)).resolves.toBeNull()
  })

  it("round-trips a GitHub account lookup token", async () => {
    const token = await mintGitHubAccountLookupToken("12345")

    await expect(verifyGitHubAccountLookupToken(token, "12345")).resolves.toBe(true)
    await expect(verifyGitHubAccountLookupToken(token, "54321")).resolves.toBe(false)
  })
})
