import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  batchCommitMock,
  createFileContentIfAbsentMock,
  getGitHubTokenMock,
  resolveActingUserIdMock,
  resolveRepoRoleMock,
} = vi.hoisted(() => ({
  batchCommitMock: vi.fn(),
  createFileContentIfAbsentMock: vi.fn(),
  getGitHubTokenMock: vi.fn(),
  resolveActingUserIdMock: vi.fn(),
  resolveRepoRoleMock: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth-server", () => ({ getGitHubToken: getGitHubTokenMock }))
vi.mock("@/lib/github", () => ({
  batchCommit: batchCommitMock,
  createFileContentIfAbsent: createFileContentIfAbsentMock,
}))
vi.mock("@/lib/github-permissions", () => ({ resolveRepoRole: resolveRepoRoleMock }))
vi.mock("@/lib/server-context", () => ({ resolveActingUserId: resolveActingUserIdMock }))

import { initRepoPressAction } from "../init-actions"

describe("initRepoPressAction native-discovery setup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGitHubTokenMock.mockResolvedValue("github-token")
    resolveActingUserIdMock.mockResolvedValue("user-1")
    resolveRepoRoleMock.mockResolvedValue({ role: "owner" })
    batchCommitMock.mockResolvedValue({ commitSha: "legacy-commit" })
    createFileContentIfAbsentMock.mockResolvedValue({ commit: { sha: "commit-1" } })
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
    expect(createFileContentIfAbsentMock).toHaveBeenCalledTimes(1)
    const [, , , path, content, message, branch] = createFileContentIfAbsentMock.mock.calls[0]
    expect(branch).toBe("main")
    expect(path).toBe("repopress.config.json")
    expect(batchCommitMock).not.toHaveBeenCalled()

    const config = JSON.parse(content)
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
    const content = createFileContentIfAbsentMock.mock.calls[0][4]
    expect(JSON.parse(content)).toEqual({
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
    expect(createFileContentIfAbsentMock).not.toHaveBeenCalled()
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
    expect(createFileContentIfAbsentMock).not.toHaveBeenCalled()
    expect(batchCommitMock).not.toHaveBeenCalled()
  })

  it("surfaces an existing-config conflict without retrying through an update-capable helper", async () => {
    const conflict = Object.assign(new Error("repopress.config.json already exists"), { status: 422 })
    createFileContentIfAbsentMock.mockRejectedValueOnce(conflict)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const result = await initRepoPressAction("acme", "docs", "main", {
      id: "main",
      name: "Docs Content",
      contentRoot: "content/docs",
      framework: "fumadocs",
      contentType: "docs",
    })

    expect(result).toEqual({ success: false, error: "repopress.config.json already exists" })
    expect(createFileContentIfAbsentMock).toHaveBeenCalledTimes(1)
    expect(batchCommitMock).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith("Failed to init RepoPress:", conflict)
    consoleError.mockRestore()
  })
})
