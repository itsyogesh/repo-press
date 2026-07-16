import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { safeGetAuthUserMock } = vi.hoisted(() => ({
  safeGetAuthUserMock: vi.fn(),
}))

vi.mock("@/convex/_generated/server", () => ({
  action: (definition: unknown) => definition,
  internalMutation: (definition: unknown) => definition,
  internalQuery: (definition: unknown) => definition,
  mutation: (definition: unknown) => definition,
  query: (definition: unknown) => definition,
}))

vi.mock("@/convex/auth", () => ({
  authComponent: {
    safeGetAuthUser: safeGetAuthUserMock,
  },
}))

import { syncTreeTitles } from "@/convex/documents"
import { scanImagesFromGitHub } from "@/convex/mediaGallery"
import { consumeGitHubActionRateLimit, getGitHubActionProjectAccess } from "@/convex/projects"

const BASE_SHA = "a".repeat(40)
const COMPARE_URL = `https://api.github.com/repos/acme/docs/compare/${BASE_SHA}...main`

function actionCtx() {
  return {
    runQuery: vi.fn().mockResolvedValue([]),
    runMutation: vi.fn().mockResolvedValue("document_1"),
  } as any
}

function authorizeEditor(ctx: ReturnType<typeof actionCtx>, existingDocuments: unknown[] = []) {
  safeGetAuthUserMock.mockResolvedValue({ _id: "editor_1" })
  ctx.runQuery
    .mockResolvedValueOnce({ userId: "editor_1" })
    .mockResolvedValueOnce({
      project: {
        _id: "project_1",
        userId: "owner_1",
        repoOwner: "acme",
        repoName: "docs",
        branch: "main",
        contentRoot: "content",
      },
      role: "editor",
    })
    .mockResolvedValueOnce(existingDocuments)
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input)
    if (url === "https://api.github.com/user") {
      return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
    }
    if (url === "https://api.github.com/repos/acme/docs") {
      return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
    }
    if (url === COMPARE_URL) {
      return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
    }
    return {
      ok: true,
      json: vi.fn().mockResolvedValue({
        type: "file",
        sha: "f".repeat(40),
        size: 21,
        encoding: "base64",
        content: btoa("---\ntitle: Guide\n---\n"),
      }),
    } as any
  })
}

describe("public Convex GitHub action boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue(null)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 123 }),
        text: vi.fn().mockResolvedValue("---\ntitle: Forged\n---\n"),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("rejects direct title sync when a forged userId has no authenticated actor", async () => {
    const ctx = actionCtx()

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        owner: "victim",
        repo: "private-docs",
        branch: "main",
        readRef: BASE_SHA,
        contentRoot: "content",
        files: [{ path: "guide.mdx", repoPath: "content/guide.mdx", sha: "f".repeat(40) }],
        githubToken: "attacker-token",
        userId: "project-owner",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual(["https://api.github.com/user"])
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects an OAuth action when the GitHub credential maps to a different user", async () => {
    safeGetAuthUserMock.mockResolvedValue({ _id: "oauth_user" })
    const ctx = actionCtx()
    ctx.runQuery.mockResolvedValueOnce({ userId: "token_owner" })
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any)

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files: [],
        githubToken: "different-users-token",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.runQuery).toHaveBeenCalledOnce()
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects a viewer before checking repository permissions", async () => {
    safeGetAuthUserMock.mockResolvedValue({ _id: "viewer_1" })
    const ctx = actionCtx()
    ctx.runQuery.mockResolvedValueOnce({ userId: "viewer_1" }).mockResolvedValueOnce({
      project: {
        _id: "project_1",
        userId: "owner_1",
        repoOwner: "acme",
        repoName: "docs",
        branch: "main",
        contentRoot: "content",
      },
      role: "viewer",
    })

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files: [{ path: "guide.mdx", sha: "f".repeat(40) }],
        githubToken: "viewer-token",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual(["https://api.github.com/user"])
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects an editor whose GitHub credential no longer has push permission", async () => {
    const ctx = actionCtx()
    authorizeEditor(ctx)
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === "https://api.github.com/repos/acme/docs") {
        return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { pull: true } }) } as any
      }
      return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
    })

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files: [{ path: "guide.mdx", sha: "f".repeat(40) }],
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toContain(COMPARE_URL)
    expect(ctx.runMutation).toHaveBeenCalledTimes(1)
  })

  it("attributes PAT authorization to the mapped GitHub user instead of the project owner", async () => {
    safeGetAuthUserMock.mockResolvedValue(null)
    const ctx = actionCtx()
    ctx.runQuery
      .mockResolvedValueOnce({ userId: "pat_editor" })
      .mockResolvedValueOnce({
        project: {
          _id: "project_1",
          userId: "owner_1",
          repoOwner: "acme",
          repoName: "docs",
          branch: "main",
          contentRoot: "content",
        },
        role: "editor",
      })
      .mockResolvedValueOnce([])
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === "https://api.github.com/repos/acme/docs") {
        return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
      }
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          type: "file",
          sha: "f".repeat(40),
          size: 21,
          encoding: "base64",
          content: btoa("---\ntitle: Guide\n---\n"),
        }),
      } as any
    })

    await (syncTreeTitles as any).handler(ctx, {
      projectId: "project_1",
      readRef: BASE_SHA,
      files: [{ path: "guide.mdx", sha: "f".repeat(40) }],
      githubToken: "pat-token",
      userId: "owner_1",
    })

    expect(ctx.runQuery.mock.calls[1][1]).toEqual({ projectId: "project_1", userId: "pat_editor" })
    expect(ctx.runMutation).toHaveBeenCalledTimes(2)
    expect(ctx.runMutation.mock.calls[0][1]).toEqual({
      projectId: "project_1",
      userId: "pat_editor",
      action: "title_sync",
    })
    expect(ctx.runMutation.mock.calls[1][1]).not.toHaveProperty("userId")
    expect(ctx.runMutation.mock.calls[1][1]).not.toHaveProperty("editedBy")
  })

  it("rejects a malformed title-sync read ref at the Convex boundary", async () => {
    safeGetAuthUserMock.mockResolvedValue({ _id: "editor_1" })
    const ctx = actionCtx()
    ctx.runQuery
      .mockResolvedValueOnce({ userId: "editor_1" })
      .mockResolvedValueOnce({
        project: {
          _id: "project_1",
          userId: "owner_1",
          repoOwner: "acme",
          repoName: "docs",
          branch: "main",
          contentRoot: "content",
        },
        role: "editor",
      })
      .mockResolvedValueOnce([])
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === "https://api.github.com/repos/acme/docs") {
        return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
      }
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          type: "file",
          sha: "f".repeat(40),
          size: 21,
          encoding: "base64",
          content: btoa("---\ntitle: Guide\n---\n"),
        }),
      } as any
    })

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: "main",
        files: [{ path: "guide.mdx", repoPath: "content/guide.mdx", sha: "f".repeat(40) }],
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("Invalid read ref")

    expect(ctx.runMutation).not.toHaveBeenCalled()
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false)
  })

  it("rejects a malformed title-sync file SHA before reading or writing content", async () => {
    safeGetAuthUserMock.mockResolvedValue({ _id: "editor_1" })
    const ctx = actionCtx()
    ctx.runQuery.mockResolvedValueOnce({ userId: "editor_1" }).mockResolvedValueOnce({
      project: {
        _id: "project_1",
        userId: "owner_1",
        repoOwner: "acme",
        repoName: "docs",
        branch: "main",
        contentRoot: "content",
      },
      role: "editor",
    })
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
      }
      return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
    })

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files: [{ path: "guide.mdx", sha: "not-a-sha" }],
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("Invalid file sha")

    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false)
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects a title-sync path that escapes the project content root", async () => {
    safeGetAuthUserMock.mockResolvedValue({ _id: "editor_1" })
    const ctx = actionCtx()
    ctx.runQuery
      .mockResolvedValueOnce({ userId: "editor_1" })
      .mockResolvedValueOnce({
        project: {
          _id: "project_1",
          userId: "owner_1",
          repoOwner: "acme",
          repoName: "docs",
          branch: "main",
          contentRoot: "content",
        },
        role: "editor",
      })
      .mockResolvedValueOnce([])
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
      }
      return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
    })

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files: [{ path: "../secrets.mdx", sha: "f".repeat(40) }],
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("escapes content root")

    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false)
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects non-MDX title-sync files before reading or writing content", async () => {
    const ctx = actionCtx()
    authorizeEditor(ctx)

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files: [{ path: "hero.png", sha: "f".repeat(40) }],
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("Unsupported content file")

    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false)
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects an oversized title-sync path before reading or writing content", async () => {
    const ctx = actionCtx()
    authorizeEditor(ctx)

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files: [{ path: `${"x".repeat(1_021)}.mdx`, sha: "f".repeat(40) }],
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("content path exceeds")

    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false)
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects an oversized title-sync file list before reading or writing content", async () => {
    const ctx = actionCtx()
    authorizeEditor(ctx, [{ filePath: "guide.mdx", pathRepresentation: "content_relative_v1" }])
    const files = Array.from({ length: 257 }, () => ({ path: "guide.mdx", sha: "f".repeat(40) }))

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files,
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("file list exceeds")

    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false)
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects a sparse title-sync file list before reading or writing content", async () => {
    const ctx = actionCtx()
    authorizeEditor(ctx)
    const files = new Array(1)

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files,
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("Invalid file list")

    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false)
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects duplicate title-sync paths before repeated reads or writes", async () => {
    const ctx = actionCtx()
    authorizeEditor(ctx)

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files: [
          { path: "guide.mdx", sha: "f".repeat(40) },
          { path: "guide.mdx", sha: "f".repeat(40) },
        ],
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("Duplicate content path")

    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false)
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects excessive aggregate title-sync path bytes before repository reads", async () => {
    const files = Array.from({ length: 200 }, (_, index) => ({
      path: `${index}-${"x".repeat(900)}.mdx`,
      sha: "f".repeat(40),
    }))
    const ctx = actionCtx()
    authorizeEditor(
      ctx,
      files.map((file) => ({ filePath: file.path, pathRepresentation: "content_relative_v1" })),
    )

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files,
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("total path bytes exceed")

    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false)
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects title content whose blob SHA does not match the authorized snapshot tree", async () => {
    const ctx = actionCtx()
    authorizeEditor(ctx)
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === "https://api.github.com/repos/acme/docs") {
        return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
      }
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          type: "file",
          sha: "e".repeat(40),
          size: 24,
          encoding: "base64",
          content: btoa("---\ntitle: Wrong blob\n---\n"),
        }),
      } as any
    })

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files: [{ path: "guide.mdx", sha: "f".repeat(40) }],
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("File SHA mismatch")

    expect(ctx.runMutation).toHaveBeenCalledTimes(1)
    expect(ctx.runMutation.mock.calls[0][1]).toEqual({
      projectId: "project_1",
      userId: "editor_1",
      action: "title_sync",
    })
  })

  it("rejects a title-sync commit that is unrelated to the configured project branch", async () => {
    const ctx = actionCtx()
    authorizeEditor(ctx)
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === "https://api.github.com/repos/acme/docs") {
        return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "diverged" }) } as any
      }
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          type: "file",
          sha: "f".repeat(40),
          size: 21,
          encoding: "base64",
          content: btoa("---\ntitle: Guide\n---\n"),
        }),
      } as any
    })

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files: [{ path: "guide.mdx", sha: "f".repeat(40) }],
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("Unauthorized read ref")

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(COMPARE_URL)
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false)
    expect(ctx.runMutation).toHaveBeenCalledTimes(1)
  })

  it("checks the per-actor title-sync quota before any content fan-out", async () => {
    const ctx = actionCtx()
    authorizeEditor(ctx)
    ctx.runMutation.mockRejectedValue(new Error("Rate limit exceeded"))

    await expect(
      (syncTreeTitles as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        files: [{ path: "guide.mdx", sha: "f".repeat(40) }],
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("Rate limit exceeded")

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual(["https://api.github.com/user"])
  })

  it("derives title-sync repository coordinates and actor from the authorized project", async () => {
    safeGetAuthUserMock.mockResolvedValue({ _id: "editor_1" })
    const ctx = actionCtx()
    ctx.runQuery
      .mockResolvedValueOnce({ userId: "editor_1" })
      .mockResolvedValueOnce({
        project: {
          _id: "project_1",
          userId: "owner_1",
          repoOwner: "acme",
          repoName: "docs",
          branch: "main",
          contentRoot: "content",
        },
        role: "editor",
      })
      .mockResolvedValueOnce([])
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === "https://api.github.com/repos/acme/docs") {
        return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
      }
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          type: "file",
          sha: "f".repeat(40),
          size: 21,
          encoding: "base64",
          content: btoa("---\ntitle: Guide\n---\n"),
        }),
      } as any
    })

    await (syncTreeTitles as any).handler(ctx, {
      projectId: "project_1",
      owner: "attacker",
      repo: "unrelated",
      branch: "forged",
      readRef: BASE_SHA,
      contentRoot: "stolen",
      files: [{ path: "guide.mdx", repoPath: "private/secret.mdx", sha: "f".repeat(40) }],
      githubToken: "editor-token",
      userId: "owner_1",
    })

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url))
    expect(urls).toContain(`https://api.github.com/repos/acme/docs/contents/content%2Fguide.mdx?ref=${BASE_SHA}`)
    expect(urls.some((url) => url.includes("attacker") || url.includes("private%2Fsecret"))).toBe(false)
    expect(ctx.runQuery.mock.calls[1][1]).toEqual({ projectId: "project_1", userId: "editor_1" })
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ projectId: "project_1", filePath: "guide.mdx", title: "Guide" }),
    )
  })

  it("rejects a gallery scan that forges the project owner through userId", async () => {
    const ctx = actionCtx()
    ctx.runQuery.mockResolvedValue(true)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ tree: [] }),
    } as any)

    await expect(
      (scanImagesFromGitHub as any).handler(ctx, {
        projectId: "project_1",
        owner: "victim",
        repo: "private-media",
        branch: "main",
        readRef: BASE_SHA,
        githubToken: "attacker-token",
        userId: "project-owner",
        projectAccessToken: "forged-token",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("scans media only from the authorized project's repository", async () => {
    safeGetAuthUserMock.mockResolvedValue({ _id: "editor_1" })
    const ctx = actionCtx()
    ctx.runQuery.mockResolvedValueOnce({ userId: "editor_1" }).mockResolvedValueOnce({
      project: {
        _id: "project_1",
        userId: "owner_1",
        repoOwner: "acme",
        repoName: "docs",
        branch: "main",
        contentRoot: "content",
      },
      role: "editor",
    })
    ctx.runMutation.mockResolvedValue({ wasInserted: true })
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === "https://api.github.com/repos/acme/docs") {
        return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
      }
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          tree: [{ path: "public/hero.png", sha: "f".repeat(40), type: "blob", size: 42 }],
        }),
      } as any
    })

    const result = await (scanImagesFromGitHub as any).handler(ctx, {
      projectId: "project_1",
      owner: "attacker",
      repo: "unrelated",
      readRef: BASE_SHA,
      githubToken: "editor-token",
      userId: "owner_1",
    })

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url))
    expect(urls).toContain(`https://api.github.com/repos/acme/docs/git/trees/${BASE_SHA}?recursive=1`)
    expect(urls.some((url) => url.includes("attacker"))).toBe(false)
    expect(ctx.runQuery.mock.calls[1][1]).toEqual({ projectId: "project_1", userId: "editor_1" })
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ projectId: "project_1", filePath: "public/hero.png" }),
    )
    expect(result).toEqual({ found: 1, inserted: 1, updated: 0, truncated: false })
  })

  it("rejects a malformed gallery read ref before scanning the project tree", async () => {
    safeGetAuthUserMock.mockResolvedValue({ _id: "editor_1" })
    const ctx = actionCtx()
    ctx.runQuery.mockResolvedValueOnce({ userId: "editor_1" }).mockResolvedValueOnce({
      project: {
        _id: "project_1",
        userId: "owner_1",
        repoOwner: "acme",
        repoName: "docs",
        branch: "main",
        contentRoot: "content",
      },
      role: "editor",
    })
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true }, tree: [] }) } as any
    })

    await expect(
      (scanImagesFromGitHub as any).handler(ctx, {
        projectId: "project_1",
        readRef: "release",
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("Invalid read ref")

    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/git/trees/"))).toBe(false)
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it("rejects a gallery commit that is unrelated to the configured project branch", async () => {
    safeGetAuthUserMock.mockResolvedValue({ _id: "editor_1" })
    const ctx = actionCtx()
    ctx.runQuery.mockResolvedValueOnce({ userId: "editor_1" }).mockResolvedValueOnce({
      project: {
        _id: "project_1",
        userId: "owner_1",
        repoOwner: "acme",
        repoName: "docs",
        branch: "main",
        contentRoot: "content",
      },
      role: "editor",
    })
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === "https://api.github.com/repos/acme/docs") {
        return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "diverged" }) } as any
      }
      return { ok: true, json: vi.fn().mockResolvedValue({ tree: [] }) } as any
    })

    await expect(
      (scanImagesFromGitHub as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("Unauthorized read ref")

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(COMPARE_URL)
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/git/trees/"))).toBe(false)
    expect(ctx.runMutation).toHaveBeenCalledTimes(1)
  })

  it("checks the per-actor gallery quota before fetching the recursive tree", async () => {
    safeGetAuthUserMock.mockResolvedValue({ _id: "editor_1" })
    const ctx = actionCtx()
    ctx.runQuery.mockResolvedValueOnce({ userId: "editor_1" }).mockResolvedValueOnce({
      project: {
        _id: "project_1",
        userId: "owner_1",
        repoOwner: "acme",
        repoName: "docs",
        branch: "main",
        contentRoot: "content",
      },
      role: "editor",
    })
    ctx.runMutation.mockRejectedValue(new Error("Rate limit exceeded"))
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === "https://api.github.com/repos/acme/docs") {
        return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
      }
      return { ok: true, json: vi.fn().mockResolvedValue({ tree: [] }) } as any
    })

    await expect(
      (scanImagesFromGitHub as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("Rate limit exceeded")

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual(["https://api.github.com/user"])
  })

  it("rejects a truncated gallery tree before any media writes", async () => {
    const ctx = actionCtx()
    authorizeEditor(ctx)
    ctx.runMutation.mockResolvedValue({ wasInserted: true })
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === "https://api.github.com/repos/acme/docs") {
        return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
      }
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          truncated: true,
          tree: [{ path: "public/hero.png", sha: "f".repeat(40), type: "blob", size: 42 }],
        }),
      } as any
    })

    await expect(
      (scanImagesFromGitHub as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("truncated")

    expect(ctx.runMutation).toHaveBeenCalledTimes(1)
  })

  it("rejects an oversized gallery image set before any media writes", async () => {
    const ctx = actionCtx()
    authorizeEditor(ctx)
    ctx.runMutation.mockResolvedValue({ wasInserted: true })
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://api.github.com/user") {
        return { ok: true, json: vi.fn().mockResolvedValue({ id: 123 }) } as any
      }
      if (url === "https://api.github.com/repos/acme/docs") {
        return { ok: true, json: vi.fn().mockResolvedValue({ permissions: { push: true } }) } as any
      }
      if (url === COMPARE_URL) {
        return { ok: true, json: vi.fn().mockResolvedValue({ status: "ahead" }) } as any
      }
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          tree: Array.from({ length: 1_001 }, (_, index) => ({
            path: `public/image-${index}.png`,
            sha: "f".repeat(40),
            type: "blob",
            size: 42,
          })),
        }),
      } as any
    })

    await expect(
      (scanImagesFromGitHub as any).handler(ctx, {
        projectId: "project_1",
        readRef: BASE_SHA,
        githubToken: "editor-token",
      }),
    ).rejects.toThrow("image limit")

    expect(ctx.runMutation).toHaveBeenCalledTimes(1)
  })
})

describe("GitHub action access persistence", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ["missing", null],
    ["expired", { role: "editor", expiresAt: 999 }],
  ])("rejects %s shared-repository access cache entries", async (_label, cached) => {
    vi.spyOn(Date, "now").mockReturnValue(1_000)
    const first = vi.fn().mockResolvedValue(cached)
    const withIndex = vi.fn().mockReturnValue({ first })
    const ctx = {
      db: {
        get: vi.fn().mockResolvedValue({
          _id: "project_1",
          userId: "owner_1",
          repoOwner: "acme",
          repoName: "docs",
        }),
        query: vi.fn().mockReturnValue({ withIndex }),
      },
    }

    await expect(
      (getGitHubActionProjectAccess as any).handler(ctx, {
        projectId: "project_1",
        userId: "editor_1",
      }),
    ).resolves.toBeNull()
  })

  it("increments an actor's title-sync allowance within the active window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(30_000)
    const patch = vi.fn().mockResolvedValue(undefined)
    const ctx = {
      db: {
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({
              _id: "limit_1",
              windowStartedAt: 0,
              attempts: 3,
            }),
          }),
        }),
        patch,
        insert: vi.fn(),
      },
    }

    await (consumeGitHubActionRateLimit as any).handler(ctx, {
      projectId: "project_1",
      userId: "editor_1",
      action: "title_sync",
    })

    expect(patch).toHaveBeenCalledWith("limit_1", { attempts: 4, updatedAt: 30_000 })
  })

  it("rejects an actor after the global title-sync burst is exhausted", async () => {
    vi.spyOn(Date, "now").mockReturnValue(30_000)
    const patch = vi.fn()
    const ctx = {
      db: {
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({
              _id: "limit_1",
              windowStartedAt: 0,
              attempts: 8,
            }),
          }),
        }),
        patch,
        insert: vi.fn(),
      },
    }

    await expect(
      (consumeGitHubActionRateLimit as any).handler(ctx, {
        projectId: "project_1",
        userId: "editor_1",
        action: "title_sync",
      }),
    ).rejects.toThrow("Rate limit exceeded")
    expect(patch).not.toHaveBeenCalled()
  })

  it("enforces a global actor allowance across distinct projects", async () => {
    vi.spyOn(Date, "now").mockReturnValue(30_000)
    const rows: Array<Record<string, any>> = []
    const ctx = {
      db: {
        query: vi.fn().mockImplementation(() => ({
          withIndex: vi.fn().mockImplementation((_indexName, applyIndex) => {
            const filters: Record<string, unknown> = {}
            const queryBuilder = {
              eq(field: string, value: unknown) {
                filters[field] = value
                return queryBuilder
              },
            }
            applyIndex(queryBuilder)
            return {
              first: async () =>
                rows.find((row) => Object.entries(filters).every(([field, value]) => row[field] === value)) ?? null,
            }
          }),
        })),
        insert: vi.fn().mockImplementation(async (_table, value) => {
          rows.push({ _id: `limit_${rows.length + 1}`, ...value })
        }),
        patch: vi.fn().mockImplementation(async (id, updates) => {
          const row = rows.find((candidate) => candidate._id === id)
          if (row) Object.assign(row, updates)
        }),
      },
    }

    for (let index = 0; index < 8; index++) {
      await (consumeGitHubActionRateLimit as any).handler(ctx, {
        projectId: `project_${index}`,
        userId: "editor_1",
        action: "title_sync",
      })
    }

    await expect(
      (consumeGitHubActionRateLimit as any).handler(ctx, {
        projectId: "project_9",
        userId: "editor_1",
        action: "title_sync",
      }),
    ).rejects.toThrow("Rate limit exceeded")
  })

  it("resets an expired gallery-scan window atomically", async () => {
    vi.spyOn(Date, "now").mockReturnValue(60_001)
    const patch = vi.fn().mockResolvedValue(undefined)
    const ctx = {
      db: {
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({
              _id: "limit_1",
              windowStartedAt: 0,
              attempts: 2,
            }),
          }),
        }),
        patch,
        insert: vi.fn(),
      },
    }

    await (consumeGitHubActionRateLimit as any).handler(ctx, {
      projectId: "project_1",
      userId: "editor_1",
      action: "gallery_scan",
    })

    expect(patch).toHaveBeenCalledWith("limit_1", {
      windowStartedAt: 60_001,
      attempts: 1,
      updatedAt: 60_001,
    })
  })
})
