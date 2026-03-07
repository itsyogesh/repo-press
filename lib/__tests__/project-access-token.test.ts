import { beforeEach, describe, expect, it } from "vitest"
import { mintProjectAccessToken, verifyProjectAccessToken } from "../project-access-token"

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
})
