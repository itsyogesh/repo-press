// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const batchCommitMock = vi.fn()
const getGitHubTokenMock = vi.fn()
const resolveRepoRoleMock = vi.fn()
const resolveActingUserIdMock = vi.fn()
const revalidatePathMock = vi.fn()

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock("@/lib/auth-server", () => ({
  getGitHubToken: getGitHubTokenMock,
}))

vi.mock("@/lib/github", () => ({
  batchCommit: batchCommitMock,
}))

vi.mock("@/lib/github-permissions", () => ({
  resolveRepoRole: resolveRepoRoleMock,
}))

vi.mock("@/lib/server-context", () => ({
  resolveActingUserId: resolveActingUserIdMock,
}))

describe("initRepoPressAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGitHubTokenMock.mockResolvedValue("token")
    resolveActingUserIdMock.mockResolvedValue("user_123")
    resolveRepoRoleMock.mockResolvedValue({ role: "owner" })
    batchCommitMock.mockResolvedValue(undefined)
  })

  it("creates a minimal manifest without preview adapter scaffolding", async () => {
    const { initRepoPressAction } = await import("../init-actions")

    const result = await initRepoPressAction("acme", "repo-press", "main", {
      id: "docs",
      name: "Docs",
      contentRoot: "content/docs",
      framework: "next-mdx",
      contentType: "docs",
    })

    expect(result).toEqual({ success: true })
    expect(batchCommitMock).toHaveBeenCalledTimes(1)

    const [token, owner, repo, branch, files, message] = batchCommitMock.mock.calls[0]

    expect(token).toBe("token")
    expect(owner).toBe("acme")
    expect(repo).toBe("repo-press")
    expect(branch).toBe("main")
    expect(message).toBe("chore: initialize RepoPress configuration")
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      path: "repopress.config.json",
      action: "create",
    })

    const committedConfig = JSON.parse(files[0].content)
    expect(committedConfig.defaults.preview).toBeUndefined()
    expect(committedConfig.projects[0].components).toBeUndefined()
    expect(committedConfig.projects[0].preview).toBeUndefined()
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/acme/repo-press/setup")
  })
})
