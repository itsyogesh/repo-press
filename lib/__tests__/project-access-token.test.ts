import { beforeEach, describe, expect, it } from "vitest"
import {
  mintGitHubAccountLookupToken,
  mintProjectAccessToken,
  mintServerQueryToken,
  verifyGitHubAccountLookupToken,
  verifyProjectAccessToken,
  verifyServerQueryToken,
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

describe("server query token", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret"
  })

  it("round-trips a valid server query token", async () => {
    const token = await mintServerQueryToken()

    await expect(verifyServerQueryToken(token)).resolves.toBe(true)
  })

  it("rejects tampered server query tokens", async () => {
    const token = await mintServerQueryToken()
    const tampered = token.replace("server-query", "server-admin")

    await expect(verifyServerQueryToken(tampered)).resolves.toBe(false)
  })

  it("rejects null and undefined tokens", async () => {
    await expect(verifyServerQueryToken(null)).resolves.toBe(false)
    await expect(verifyServerQueryToken(undefined)).resolves.toBe(false)
    await expect(verifyServerQueryToken("")).resolves.toBe(false)
  })

  it("rejects malformed tokens without a separator", async () => {
    await expect(verifyServerQueryToken("noseparator")).resolves.toBe(false)
  })
})
