import { beforeEach, describe, expect, it, vi } from "vitest"

const { mutationMock, authenticatedUserMock, mintBootstrapTokenMock } = vi.hoisted(() => ({
  mutationMock: vi.fn(),
  authenticatedUserMock: vi.fn(),
  mintBootstrapTokenMock: vi.fn(),
}))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    mutation = mutationMock
  },
}))

vi.mock("@convex-dev/better-auth/nextjs", () => ({
  convexBetterAuthNextJs: () => ({}),
}))

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

vi.mock("@/lib/github", () => ({
  createGitHubClient: () => ({
    users: { getAuthenticated: authenticatedUserMock },
  }),
}))

vi.mock("@/lib/project-access-token", () => ({
  mintGitHubIdentityBootstrapToken: mintBootstrapTokenMock,
}))

describe("getPatAuthUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud"
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL = "https://example.convex.site"
    authenticatedUserMock.mockResolvedValue({
      data: {
        id: 12345,
        login: "octocat",
        name: "The Octocat",
        avatar_url: "https://avatars.githubusercontent.com/u/12345",
      },
    })
    mintBootstrapTokenMock.mockResolvedValue("signed-bootstrap-token")
    mutationMock.mockResolvedValue("user_created")
  })

  it("uses verified GitHub profile data to resolve or create a stable Better Auth user", async () => {
    const { getPatAuthUserId } = await import("../auth-server")

    await expect(getPatAuthUserId("secret-github-token")).resolves.toBe("user_created")
    expect(mintBootstrapTokenMock).toHaveBeenCalledWith({
      githubAccountId: "12345",
      githubUsername: "octocat",
      name: "The Octocat",
      image: "https://avatars.githubusercontent.com/u/12345",
    })
    expect(mutationMock).toHaveBeenCalledWith(expect.anything(), {
      bootstrapToken: "signed-bootstrap-token",
    })
    expect(JSON.stringify(mutationMock.mock.calls)).not.toContain("secret-github-token")
  })
})
