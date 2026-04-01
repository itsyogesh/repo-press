import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { convexQueryMock, convexMutationMock } = vi.hoisted(() => ({
  convexQueryMock: vi.fn(),
  convexMutationMock: vi.fn(),
}))

const { deleteRefMock } = vi.hoisted(() => ({
  deleteRefMock: vi.fn(),
}))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convexQueryMock
    mutation = convexMutationMock
  },
}))

vi.mock("@/lib/auth-server", () => ({
  fetchAuthQuery: vi.fn(),
  getGitHubToken: vi.fn(),
  getPatAuthUserId: vi.fn(),
}))

vi.mock("@/lib/github", () => ({
  batchCommit: vi.fn(),
  createBranch: vi.fn(),
  createGitHubClient: vi.fn(),
  createPullRequest: vi.fn(),
  getFile: vi.fn(),
}))

vi.mock("@/lib/github-permissions", () => ({
  getRepoRole: vi.fn(),
  probeRepoReadAccess: vi.fn().mockResolvedValue(null),
  roleAtLeast: (actual: string, minimum: string) => {
    const h: Record<string, number> = { owner: 3, editor: 2, viewer: 1 }
    return (h[actual] ?? 0) >= (h[minimum] ?? 0)
  },
}))

process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://example.convex.cloud"

import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { batchCommit, createBranch, createGitHubClient, createPullRequest, getFile } from "@/lib/github"
import { getRepoRole } from "@/lib/github-permissions"
import { POST } from "../route"

const baseProject = {
  _id: "project_123",
  userId: "user_owner",
  repoOwner: "acme",
  repoName: "docs-site",
  branch: "main",
  contentRoot: "content",
}

function mockPublishQueries({
  pendingOps = [],
  dirtyDocs = [
    {
      _id: "doc_1",
      filePath: "posts/hello.mdx",
      body: "# Hello",
      frontmatter: { title: "Hello" },
    },
  ],
  pendingMediaOps = [],
  currentPublishBranch = {
    _id: "publish_branch_1",
    branchName: "repopress/main/1234",
    prNumber: 42,
    prUrl: "https://github.com/acme/docs-site/pull/42",
  },
  openPublishBranches,
  refreshedPublishBranch,
}: {
  pendingOps?: Array<Record<string, unknown>>
  dirtyDocs?: Array<Record<string, unknown>>
  pendingMediaOps?: Array<Record<string, unknown>>
  currentPublishBranch?: Record<string, unknown> | null
  openPublishBranches?: Array<Record<string, unknown>>
  refreshedPublishBranch?: Record<string, unknown>
}) {
  convexQueryMock.mockReset()
  convexQueryMock
    .mockResolvedValueOnce(baseProject)
    .mockResolvedValueOnce(pendingOps)
    .mockResolvedValueOnce(dirtyDocs)
    .mockResolvedValueOnce(pendingMediaOps)
    .mockResolvedValueOnce(currentPublishBranch)

  if (openPublishBranches !== undefined) {
    convexQueryMock.mockResolvedValueOnce(openPublishBranches)
  }

  if (refreshedPublishBranch !== undefined) {
    convexQueryMock.mockResolvedValueOnce(refreshedPublishBranch)
  }
}

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/github/publish-ops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/github/publish-ops", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexQueryMock.mockReset()
    convexMutationMock.mockReset()
    deleteRefMock.mockReset()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    vi.mocked(getGitHubToken).mockResolvedValue("gh-token")
    vi.mocked(fetchAuthQuery!).mockResolvedValue({ _id: "user_owner" } as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_owner")
    vi.mocked(getRepoRole).mockResolvedValue({ role: "owner", defaultBranch: "main", defaultBranchInferred: false })
    deleteRefMock.mockResolvedValue(undefined as never)
    vi.mocked(createGitHubClient).mockReturnValue({
      git: {
        deleteRef: deleteRefMock,
      },
      repos: {
        get: vi.fn().mockResolvedValue({}),
      },
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({ data: { login: "user_owner" } }),
      },
    } as never)
    vi.mocked(batchCommit).mockResolvedValue({ commitSha: "commit-sha-1" } as never)
    vi.mocked(getFile).mockResolvedValue({ sha: "new-sha-1" } as never)
    vi.mocked(createBranch).mockResolvedValue(undefined as never)
    vi.mocked(createPullRequest).mockResolvedValue({
      number: 99,
      htmlUrl: "https://github.com/acme/docs-site/pull/99",
    } as never)

    mockPublishQueries({})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("ignores a spoofed userId from the request body and uses the authenticated session instead", async () => {
    const response = await POST(
      buildRequest({
        projectId: "project_123",
        userId: "attacker_controlled_user",
        title: "Publish docs",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(fetchAuthQuery).toHaveBeenCalled()
    expect(batchCommit).toHaveBeenCalled()
  })

  it("rejects publishing when the authenticated user has no repo access", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue({ _id: "different_user" } as never)
    vi.mocked(getRepoRole).mockResolvedValue({ role: null, defaultBranch: null, defaultBranchInferred: false })
    convexQueryMock.mockReset()
    convexQueryMock.mockResolvedValue({
      _id: "project_123",
      userId: "user_owner",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
      contentRoot: "content",
    })

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        title: "Publish docs",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toContain("no access")
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("rejects PAT-mode publishing when the PAT user has no repo access", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("different_user")
    vi.mocked(getRepoRole).mockResolvedValue({ role: null, defaultBranch: null, defaultBranchInferred: false })

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        title: "Publish docs",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toContain("no access")
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("allows PAT-mode publishing when the PAT resolves to the project owner", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("user_owner")

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        title: "Publish docs",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(batchCommit).toHaveBeenCalled()
  })

  it("reuses the current PR by default when publishMode is omitted", async () => {
    const response = await POST(
      buildRequest({
        projectId: "project_123",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.publishModeUsed).toBe("reuse-current")
    expect(createBranch).not.toHaveBeenCalled()
    expect(createPullRequest).not.toHaveBeenCalled()
    expect(convexMutationMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ projectId: "project_123" }),
    )
  })

  it("creates a new PR when publishMode is create-new", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    mockPublishQueries({
      pendingOps: [],
      dirtyDocs: [
        {
          _id: "doc_1",
          filePath: "posts/hello.mdx",
          body: "# Hello",
          frontmatter: { title: "Hello" },
        },
      ],
      pendingMediaOps: [],
      currentPublishBranch: {
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
        committedFilePaths: ["content/posts/hello.mdx"],
      },
      openPublishBranches: [
        {
          _id: "publish_branch_1",
          branchName: "repopress/main/1234",
          prNumber: 42,
          committedFilePaths: ["content/posts/hello.mdx"],
        },
      ],
      refreshedPublishBranch: {
        _id: "publish_branch_2",
        branchName: "repopress/main/5678",
        prNumber: undefined,
        prUrl: undefined,
        committedFilePaths: [],
      },
    })

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        publishMode: "create-new",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.publishModeUsed).toBe("create-new")
    expect(createBranch).toHaveBeenCalledTimes(1)
    expect(createBranch).toHaveBeenCalledWith("gh-token", "acme", "docs-site", "main", "repopress/main/1700000000000")
    expect(createPullRequest).toHaveBeenCalledTimes(1)
    expect(createPullRequest).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      "repopress/main/1700000000000",
      "main",
      "Content update via RepoPress (1 updated)",
      "Automated content update from RepoPress.\n\n- 1 updated",
    )
    const createPublishBranchCall = convexMutationMock.mock.calls.find(
      ([, args]) =>
        typeof args === "object" &&
        args !== null &&
        "branchName" in args &&
        args.branchName === "repopress/main/1700000000000",
    )
    expect(createPublishBranchCall?.[1]).toEqual(
      expect.objectContaining({
        projectId: "project_123",
        userId: "user_owner",
        branchName: "repopress/main/1700000000000",
        baseBranch: "main",
      }),
    )
  })

  it("returns 409 when create-new overlaps files tracked by another open PR", async () => {
    vi.mocked(getFile).mockResolvedValue(null as never)
    mockPublishQueries({
      pendingOps: [
        {
          _id: "explorer_op_1",
          opType: "create",
          filePath: "posts/new-lane.mdx",
          initialBody: "# New lane",
          initialFrontmatter: { title: "New lane" },
        },
      ],
      dirtyDocs: [],
      pendingMediaOps: [],
      currentPublishBranch: {
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
        committedFilePaths: ["content/posts/existing.mdx"],
      },
      openPublishBranches: [
        {
          _id: "publish_branch_1",
          branchName: "repopress/main/1234",
          prNumber: 42,
          committedFilePaths: ["content/posts/existing.mdx"],
        },
        {
          _id: "publish_branch_9",
          branchName: "repopress/main/9999",
          prNumber: 77,
          prUrl: "https://github.com/acme/docs-site/pull/77",
          committedFilePaths: ["content/posts/new-lane.mdx"],
        },
      ],
    })

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        publishMode: "create-new",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.ok).toBe(false)
    expect(createBranch).not.toHaveBeenCalled()
    expect(createPullRequest).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("ignores inactive overlapping publish branches when create-new is requested", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_001)
    vi.mocked(getFile).mockResolvedValue(null as never)
    mockPublishQueries({
      pendingOps: [
        {
          _id: "explorer_op_1",
          opType: "create",
          filePath: "posts/new-lane.mdx",
          initialBody: "# New lane",
          initialFrontmatter: { title: "New lane" },
        },
      ],
      dirtyDocs: [],
      pendingMediaOps: [],
      currentPublishBranch: {
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
        status: "active",
        committedFilePaths: ["content/posts/existing.mdx"],
      },
      openPublishBranches: [
        {
          _id: "publish_branch_1",
          branchName: "repopress/main/1234",
          prNumber: 42,
          status: "active",
          committedFilePaths: ["content/posts/existing.mdx"],
        },
        {
          _id: "publish_branch_inactive",
          branchName: "repopress/main/8888",
          prNumber: 78,
          prUrl: "https://github.com/acme/docs-site/pull/78",
          status: "inactive",
          committedFilePaths: ["content/posts/new-lane.mdx"],
        },
      ],
      refreshedPublishBranch: {
        _id: "publish_branch_2",
        branchName: "repopress/main/5678",
        prNumber: undefined,
        prUrl: undefined,
        status: "active",
        committedFilePaths: [],
      },
    })

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        publishMode: "create-new",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.publishModeUsed).toBe("create-new")
    expect(createBranch).toHaveBeenCalledWith("gh-token", "acme", "docs-site", "main", "repopress/main/1700000000001")
    expect(createPullRequest).toHaveBeenCalledTimes(1)
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it("returns 409 when create-new loses the race to create the next active lane", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_002)
    mockPublishQueries({
      currentPublishBranch: {
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
      },
      openPublishBranches: [
        {
          _id: "publish_branch_1",
          branchName: "repopress/main/1234",
          prNumber: 42,
          status: "active",
          committedFilePaths: [],
        },
      ],
    })
    convexMutationMock.mockImplementation(async (_ref, args) => {
      if (typeof args === "object" && args !== null && "branchName" in args) {
        throw new Error("Active publish branch already exists for project")
      }
      return undefined
    })

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        publishMode: "create-new",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.ok).toBe(false)
    expect(payload.error).toContain("active publish lane")
    expect(createBranch).toHaveBeenCalledWith("gh-token", "acme", "docs-site", "main", "repopress/main/1700000000002")
    expect(createGitHubClient).toHaveBeenCalledWith("gh-token")
    expect(deleteRefMock).toHaveBeenCalledWith({
      owner: "acme",
      repo: "docs-site",
      ref: "heads/repopress/main/1700000000002",
    })
    expect(
      convexMutationMock.mock.calls.some(
        ([, args]) =>
          typeof args === "object" &&
          args !== null &&
          "projectId" in args &&
          args.projectId === "project_123" &&
          !("branchName" in args),
      ),
    ).toBe(false)
    expect(createPullRequest).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("still returns 409 when orphaned branch cleanup fails after the active-lane race", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_003)
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    deleteRefMock.mockRejectedValueOnce(new Error("cleanup failed"))
    mockPublishQueries({
      currentPublishBranch: {
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
      },
      openPublishBranches: [
        {
          _id: "publish_branch_1",
          branchName: "repopress/main/1234",
          prNumber: 42,
          status: "active",
          committedFilePaths: [],
        },
      ],
    })
    convexMutationMock.mockImplementation(async (_ref, args) => {
      if (typeof args === "object" && args !== null && "branchName" in args) {
        throw new Error("Active publish branch already exists for project")
      }
      return undefined
    })

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        publishMode: "create-new",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.ok).toBe(false)
    expect(deleteRefMock).toHaveBeenCalledWith({
      owner: "acme",
      repo: "docs-site",
      ref: "heads/repopress/main/1700000000003",
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to clean up orphaned publish branch after conflict:",
      expect.any(Error),
    )
    expect(createPullRequest).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("marks committed explorer and media ops with the new publishBranchId", async () => {
    vi.mocked(getFile).mockResolvedValue(null as never)
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
    } as never)

    mockPublishQueries({
      pendingOps: [
        {
          _id: "explorer_op_1",
          opType: "create",
          filePath: "posts/new-lane.mdx",
          initialBody: "# New lane",
          initialFrontmatter: { title: "New lane" },
        },
      ],
      dirtyDocs: [],
      pendingMediaOps: [
        {
          _id: "media_op_1",
          repoPath: "/public/uploads/hero.png",
          sourceType: "blob",
          blobUrl: "https://blob.example/hero.png",
        },
      ],
      currentPublishBranch: {
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
        committedFilePaths: ["content/posts/existing.mdx"],
      },
      openPublishBranches: [
        {
          _id: "publish_branch_1",
          branchName: "repopress/main/1234",
          prNumber: 42,
          committedFilePaths: ["content/posts/existing.mdx"],
        },
      ],
      refreshedPublishBranch: {
        _id: "publish_branch_2",
        branchName: "repopress/main/5678",
        prNumber: undefined,
        prUrl: undefined,
        committedFilePaths: [],
      },
    })

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        publishMode: "create-new",
      }),
    )

    expect(response.status).toBe(200)
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ids: ["explorer_op_1"],
        commitSha: "commit-sha-1",
        publishBranchId: "publish_branch_2",
      }),
    )
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ids: ["media_op_1"],
        commitSha: "commit-sha-1",
        publishBranchId: "publish_branch_2",
      }),
    )
  })
})
