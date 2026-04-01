import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Hoisted mocks (must be before any import that uses them) ─────────────────

const { getGitHubTokenMock, getPatAuthUserIdMock, fetchAuthQueryMock } = vi.hoisted(() => ({
  getGitHubTokenMock: vi.fn(),
  getPatAuthUserIdMock: vi.fn(),
  fetchAuthQueryMock: vi.fn(),
}))

vi.mock("@/lib/auth-server", () => ({
  getGitHubToken: getGitHubTokenMock,
  getPatAuthUserId: getPatAuthUserIdMock,
  fetchAuthQuery: fetchAuthQueryMock,
}))

const { readConfigMock, commitConfigMock, addProjectMock, updateProjectMock, removeProjectMock } = vi.hoisted(() => ({
  readConfigMock: vi.fn(),
  commitConfigMock: vi.fn(),
  addProjectMock: vi.fn(),
  updateProjectMock: vi.fn(),
  removeProjectMock: vi.fn(),
}))

vi.mock("@/lib/repopress/config-writer", () => ({
  readConfig: readConfigMock,
  commitConfig: commitConfigMock,
  addProject: addProjectMock,
  updateProject: updateProjectMock,
  removeProject: removeProjectMock,
}))

const { syncProjectsServerSideMock } = vi.hoisted(() => ({
  syncProjectsServerSideMock: vi.fn(),
}))

vi.mock("@/lib/sync-projects", () => ({
  syncProjectsServerSide: syncProjectsServerSideMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/convex/_generated/api", () => ({
  api: {
    auth: { getCurrentUser: "auth:getCurrentUser" },
  },
}))

// ── Import after mocks are in place ─────────────────────────────────────────

import {
  addProjectToConfigAction,
  commitRawConfigAction,
  removeProjectFromConfigAction,
  updateProjectInConfigAction,
} from "../config-actions"

// ── Shared fixtures ──────────────────────────────────────────────────────────

const TOKEN = "ghp_test_token"
const OWNER = "acme"
const REPO = "docs"
const BRANCH = "main"
const USER_ID = "user_abc123"

const BASE_CONFIG = {
  version: 1,
  projects: [
    { id: "docs", name: "Documentation", contentRoot: "content/docs", framework: "fumadocs", contentType: "docs" },
  ],
}

function setupHappyPath() {
  getGitHubTokenMock.mockResolvedValue(TOKEN)
  fetchAuthQueryMock.mockResolvedValue({ _id: USER_ID })
  readConfigMock.mockResolvedValue({ config: BASE_CONFIG, sha: "abc123sha" })
  commitConfigMock.mockResolvedValue(undefined)
  syncProjectsServerSideMock.mockResolvedValue({ synced: [], created: ["proj_1"], unchanged: [] })
}

// ── addProjectToConfigAction ─────────────────────────────────────────────────

describe("addProjectToConfigAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupHappyPath()
    // addProject mock returns config with the new project appended
    addProjectMock.mockReturnValue({
      ...BASE_CONFIG,
      projects: [
        ...BASE_CONFIG.projects,
        { id: "blog", name: "Blog", contentRoot: "content/blog", framework: "custom", contentType: "blog" },
      ],
    })
  })

  it("returns success + syncResult on the happy path", async () => {
    const result = await addProjectToConfigAction(OWNER, REPO, BRANCH, {
      id: "blog",
      name: "Blog",
      contentRoot: "content/blog",
      framework: "custom",
      contentType: "blog",
    })

    expect(result).toEqual({ success: true, syncResult: { synced: [], created: ["proj_1"], unchanged: [] } })
    expect(commitConfigMock).toHaveBeenCalledWith(
      TOKEN,
      OWNER,
      REPO,
      BRANCH,
      expect.objectContaining({
        projects: expect.arrayContaining([expect.objectContaining({ id: "blog" })]),
      }),
      "abc123sha",
      expect.stringContaining("Blog"),
    )
    expect(syncProjectsServerSideMock).toHaveBeenCalledWith(TOKEN, OWNER, REPO, BRANCH, USER_ID)
  })

  it("returns { success: false } when not authenticated", async () => {
    getGitHubTokenMock.mockResolvedValue(null)

    const result = await addProjectToConfigAction(OWNER, REPO, BRANCH, {
      id: "blog",
      name: "Blog",
      contentRoot: "content/blog",
      framework: "custom",
      contentType: "blog",
    })

    expect(result).toEqual({ success: false, error: "Not authenticated with GitHub" })
    expect(commitConfigMock).not.toHaveBeenCalled()
  })

  it("returns { success: false } when config fetch fails", async () => {
    readConfigMock.mockResolvedValue({ config: null, sha: null, error: "File not found" })

    const result = await addProjectToConfigAction(OWNER, REPO, BRANCH, {
      id: "blog",
      name: "Blog",
      contentRoot: "content/blog",
      framework: "custom",
      contentType: "blog",
    })

    expect(result).toEqual({ success: false, error: "File not found" })
    expect(commitConfigMock).not.toHaveBeenCalled()
  })

  it("returns { success: false } when addProject (config-writer) throws duplicate id", async () => {
    addProjectMock.mockImplementation(() => {
      throw new Error('Project with id "docs" already exists')
    })

    const result = await addProjectToConfigAction(OWNER, REPO, BRANCH, {
      id: "docs",
      name: "Docs Again",
      contentRoot: "other-path",
      framework: "custom",
      contentType: "docs",
    })

    expect(result).toEqual({ success: false, error: 'Project with id "docs" already exists' })
    expect(commitConfigMock).not.toHaveBeenCalled()
  })

  it("falls back to PAT userId when OAuth session is absent", async () => {
    fetchAuthQueryMock.mockResolvedValue(null)
    getPatAuthUserIdMock.mockResolvedValue("pat_user_xyz")
    addProjectMock.mockReturnValue(BASE_CONFIG)

    const result = await addProjectToConfigAction(OWNER, REPO, BRANCH, {
      id: "blog",
      name: "Blog",
      contentRoot: "content/blog",
      framework: "custom",
      contentType: "blog",
    })

    expect(result.success).toBe(true)
    expect(syncProjectsServerSideMock).toHaveBeenCalledWith(TOKEN, OWNER, REPO, BRANCH, "pat_user_xyz")
  })

  it("returns { success: false } when both OAuth and PAT user resolution fail", async () => {
    fetchAuthQueryMock.mockResolvedValue(null)
    getPatAuthUserIdMock.mockResolvedValue(null)

    const result = await addProjectToConfigAction(OWNER, REPO, BRANCH, {
      id: "blog",
      name: "Blog",
      contentRoot: "content/blog",
      framework: "custom",
      contentType: "blog",
    })

    expect(result).toEqual({ success: false, error: "No authenticated user found" })
    expect(commitConfigMock).not.toHaveBeenCalled()
  })
})

// ── updateProjectInConfigAction ──────────────────────────────────────────────

describe("updateProjectInConfigAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupHappyPath()
    updateProjectMock.mockReturnValue(BASE_CONFIG)
  })

  it("commits updated config and returns success", async () => {
    const result = await updateProjectInConfigAction(OWNER, REPO, BRANCH, "docs", { name: "Documentation v2" })

    expect(result.success).toBe(true)
    expect(updateProjectMock).toHaveBeenCalledWith(BASE_CONFIG, "docs", { name: "Documentation v2" })
    expect(commitConfigMock).toHaveBeenCalledWith(
      TOKEN,
      OWNER,
      REPO,
      BRANCH,
      BASE_CONFIG,
      "abc123sha",
      'chore(repopress): update project "docs"',
    )
  })

  it("returns { success: false } when updateProject throws unknown id", async () => {
    updateProjectMock.mockImplementation(() => {
      throw new Error('Project "missing" not found')
    })

    const result = await updateProjectInConfigAction(OWNER, REPO, BRANCH, "missing", { name: "X" })

    expect(result).toEqual({ success: false, error: 'Project "missing" not found' })
    expect(commitConfigMock).not.toHaveBeenCalled()
  })

  it("returns { success: false } when not authenticated", async () => {
    getGitHubTokenMock.mockResolvedValue(null)

    const result = await updateProjectInConfigAction(OWNER, REPO, BRANCH, "docs", { name: "X" })

    expect(result.success).toBe(false)
  })
})

// ── removeProjectFromConfigAction ────────────────────────────────────────────

describe("removeProjectFromConfigAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupHappyPath()
    removeProjectMock.mockReturnValue({
      ...BASE_CONFIG,
      projects: [],
    })
  })

  it("removes the project and syncs — does NOT immediately delete from Convex", async () => {
    const result = await removeProjectFromConfigAction(OWNER, REPO, BRANCH, "docs")

    expect(result.success).toBe(true)
    // removeProject is called (config-writer logic)
    expect(removeProjectMock).toHaveBeenCalledWith(BASE_CONFIG, "docs")
    // Sync triggers orphan detection inside syncProjectsFromConfig
    expect(syncProjectsServerSideMock).toHaveBeenCalledWith(TOKEN, OWNER, REPO, BRANCH, USER_ID)
    // Commit message includes the project id
    expect(commitConfigMock).toHaveBeenCalledWith(
      TOKEN,
      OWNER,
      REPO,
      BRANCH,
      expect.anything(),
      "abc123sha",
      'chore(repopress): remove project "docs"',
    )
  })

  it("returns { success: false } when not authenticated", async () => {
    getGitHubTokenMock.mockResolvedValue(null)

    const result = await removeProjectFromConfigAction(OWNER, REPO, BRANCH, "docs")

    expect(result.success).toBe(false)
    expect(commitConfigMock).not.toHaveBeenCalled()
  })

  it("returns { success: false } when config fetch returns no sha", async () => {
    readConfigMock.mockResolvedValue({ config: null, sha: null, error: "Repo not found" })

    const result = await removeProjectFromConfigAction(OWNER, REPO, BRANCH, "docs")

    expect(result).toEqual({ success: false, error: "Repo not found" })
  })

  it("returns { success: false } when removeProject (config-writer) throws", async () => {
    removeProjectMock.mockImplementation(() => {
      throw new Error("Cannot remove the last project")
    })

    const result = await removeProjectFromConfigAction(OWNER, REPO, BRANCH, "docs")

    expect(result).toEqual({ success: false, error: "Cannot remove the last project" })
    expect(commitConfigMock).not.toHaveBeenCalled()
  })
})

// ── commitRawConfigAction ────────────────────────────────────────────────────

describe("commitRawConfigAction", () => {
  const VALID_JSON = JSON.stringify({
    version: 1,
    projects: [{ id: "blog", name: "Blog", contentRoot: "content/blog", framework: "custom", contentType: "blog" }],
  })
  const SHA = "current_sha_abc"

  beforeEach(() => {
    vi.clearAllMocks()
    setupHappyPath()
  })

  it("parses, validates and commits a valid JSON config", async () => {
    const result = await commitRawConfigAction(OWNER, REPO, BRANCH, VALID_JSON, SHA)

    expect(result.success).toBe(true)
    expect(commitConfigMock).toHaveBeenCalledWith(
      TOKEN,
      OWNER,
      REPO,
      BRANCH,
      expect.objectContaining({ version: 1 }),
      SHA,
      "chore(repopress): update config via raw editor",
    )
  })

  it("returns { success: false } for malformed JSON (not parseable)", async () => {
    const result = await commitRawConfigAction(OWNER, REPO, BRANCH, "{not valid json", SHA)

    expect(result).toEqual({ success: false, error: "Invalid JSON format" })
    expect(commitConfigMock).not.toHaveBeenCalled()
  })

  it("returns { success: false } when JSON parses but fails Zod schema", async () => {
    // Missing required 'version' and 'projects'
    const result = await commitRawConfigAction(OWNER, REPO, BRANCH, JSON.stringify({ foo: "bar" }), SHA)

    expect(result.success).toBe(false)
    expect(result).toHaveProperty("error")
    expect((result as any).error).toContain("Validation failed")
    expect(commitConfigMock).not.toHaveBeenCalled()
  })

  it("returns { success: false } when not authenticated", async () => {
    getGitHubTokenMock.mockResolvedValue(null)

    const result = await commitRawConfigAction(OWNER, REPO, BRANCH, VALID_JSON, SHA)

    expect(result.success).toBe(false)
    expect(commitConfigMock).not.toHaveBeenCalled()
  })

  it("uses provided SHA (not re-fetched from GitHub) to avoid unnecessary round-trip", async () => {
    const result = await commitRawConfigAction(OWNER, REPO, BRANCH, VALID_JSON, "explicit_sha_xyz")

    expect(result.success).toBe(true)
    expect(commitConfigMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "explicit_sha_xyz",
      expect.anything(),
    )
    // readConfig should NOT have been called — raw action uses caller-supplied SHA
    expect(readConfigMock).not.toHaveBeenCalled()
  })
})
