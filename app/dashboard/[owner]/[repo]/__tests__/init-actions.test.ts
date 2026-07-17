import { beforeEach, describe, expect, it, vi } from "vitest"

const { batchCommitMock, getGitHubTokenMock, resolveActingUserIdMock, resolveRepoRoleMock } = vi.hoisted(() => ({
  batchCommitMock: vi.fn(),
  getGitHubTokenMock: vi.fn(),
  resolveActingUserIdMock: vi.fn(),
  resolveRepoRoleMock: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth-server", () => ({ getGitHubToken: getGitHubTokenMock }))
vi.mock("@/lib/github", () => ({ batchCommit: batchCommitMock }))
vi.mock("@/lib/github-permissions", () => ({ resolveRepoRole: resolveRepoRoleMock }))
vi.mock("@/lib/server-context", () => ({ resolveActingUserId: resolveActingUserIdMock }))

import { initRepoPressAction } from "../init-actions"

describe("initRepoPressAction native-discovery setup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGitHubTokenMock.mockResolvedValue("github-token")
    resolveActingUserIdMock.mockResolvedValue("user-1")
    resolveRepoRoleMock.mockResolvedValue({ role: "owner" })
    batchCommitMock.mockResolvedValue({ commitSha: "commit-1" })
  })

  it("creates only a lightweight project config and leaves preview discovery to the repository", async () => {
    const result = await initRepoPressAction("acme", "docs", "main", {
      id: "main",
      name: "Docs Content",
      contentRoot: "content/docs",
      framework: "fumadocs",
      contentType: "docs",
    })

    expect(result).toEqual({ success: true })
    expect(batchCommitMock).toHaveBeenCalledTimes(1)
    const [, , , branch, operations, message] = batchCommitMock.mock.calls[0]
    expect(branch).toBe("main")
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({ path: "repopress.config.json", action: "create" })
    expect(operations.map((operation: { path: string }) => operation.path)).not.toContain(".repopress/mdx-preview.tsx")

    const config = JSON.parse(operations[0].content)
    expect(config).toEqual({
      version: 1,
      defaults: { branch: "main", framework: "auto" },
      projects: [
        {
          id: "main",
          name: "Docs Content",
          contentRoot: "content/docs",
          framework: "fumadocs",
          contentType: "docs",
          branch: "main",
        },
      ],
    })
    expect(message).toBe("chore: initialize RepoPress configuration")
  })

  it("projects only allowlisted own data fields without reading compatibility or unknown accessors", async () => {
    let previewAccessorCalls = 0
    const projectConfig = Object.assign(Object.create({ branch: "attacker-branch", inherited: "ignored" }), {
      id: "main",
      name: "Docs Content",
      contentRoot: "content/docs",
      framework: "fumadocs",
      contentType: "docs",
      components: { Callout: { implementation: "() => null" } },
      unknown: "ignored",
    })
    Object.defineProperty(projectConfig, "preview", {
      enumerable: true,
      get: () => {
        previewAccessorCalls += 1
        return { entry: ".repopress/mdx-preview.tsx" }
      },
    })

    const result = await initRepoPressAction(
      "acme",
      "docs",
      "main",
      projectConfig as Parameters<typeof initRepoPressAction>[3],
    )

    expect(result).toEqual({ success: true })
    expect(previewAccessorCalls).toBe(0)
    const operations = batchCommitMock.mock.calls[0][4]
    expect(JSON.parse(operations[0].content)).toEqual({
      version: 1,
      defaults: { branch: "main", framework: "auto" },
      projects: [
        {
          id: "main",
          name: "Docs Content",
          contentRoot: "content/docs",
          framework: "fumadocs",
          contentType: "docs",
          branch: "main",
        },
      ],
    })
  })

  it("rejects inherited required fields without invoking them or writing to GitHub", async () => {
    let inheritedAccessorCalls = 0
    const projectConfig = Object.create({
      get id() {
        inheritedAccessorCalls += 1
        return "main"
      },
    })
    Object.assign(projectConfig, {
      name: "Docs Content",
      contentRoot: "content/docs",
      framework: "fumadocs",
      contentType: "docs",
    })

    const result = await initRepoPressAction(
      "acme",
      "docs",
      "main",
      projectConfig as Parameters<typeof initRepoPressAction>[3],
    )

    expect(result).toMatchObject({ success: false })
    expect(inheritedAccessorCalls).toBe(0)
    expect(batchCommitMock).not.toHaveBeenCalled()
  })

  it("rejects project inputs beyond the canonical config byte budget before writing to GitHub", async () => {
    const result = await initRepoPressAction("acme", "docs", "main", {
      id: "main",
      name: "x".repeat(300_000),
      contentRoot: "content/docs",
      framework: "fumadocs",
      contentType: "docs",
    })

    expect(result).toMatchObject({ success: false })
    expect(batchCommitMock).not.toHaveBeenCalled()
  })
})
