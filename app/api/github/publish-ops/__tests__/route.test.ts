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
  branchExists: vi.fn(),
  createBranch: vi.fn(),
  createGitHubClient: vi.fn(),
  createPullRequest: vi.fn(),
  getFile: vi.fn(),
  updatePullRequest: vi.fn(),
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
import {
  batchCommit,
  branchExists,
  createBranch,
  createGitHubClient,
  createPullRequest,
  getFile,
  updatePullRequest,
} from "@/lib/github"
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
  existingBranchNames = [],
  refreshedPublishBranch,
}: {
  pendingOps?: Array<Record<string, unknown>>
  dirtyDocs?: Array<Record<string, unknown>>
  pendingMediaOps?: Array<Record<string, unknown>>
  currentPublishBranch?: Record<string, unknown> | null
  openPublishBranches?: Array<Record<string, unknown>>
  existingBranchNames?: string[]
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

  convexQueryMock.mockResolvedValueOnce(existingBranchNames)

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
    vi.mocked(branchExists).mockResolvedValue(false)
    vi.mocked(createBranch).mockResolvedValue(undefined as never)
    vi.mocked(createPullRequest).mockResolvedValue({
      number: 99,
      htmlUrl: "https://github.com/acme/docs-site/pull/99",
    } as never)
    vi.mocked(updatePullRequest).mockResolvedValue(undefined as never)

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
      existingBranchNames: ["repopress/main/1234"],
      refreshedPublishBranch: {
        _id: "publish_branch_2",
        branchName: "repopress/hello",
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
    expect(createBranch).toHaveBeenCalledWith("gh-token", "acme", "docs-site", "main", "repopress/hello")
    expect(createPullRequest).toHaveBeenCalledTimes(1)
    expect(createPullRequest).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      "repopress/hello",
      "main",
      "Content update via RepoPress (1 updated) (PR from RepoPress)",
      "Automated content update from RepoPress.\n\n- 1 updated",
    )
    const createPublishBranchCall = convexMutationMock.mock.calls.find(
      ([, args]) =>
        typeof args === "object" && args !== null && "branchName" in args && args.branchName === "repopress/hello",
    )
    expect(createPublishBranchCall?.[1]).toEqual(
      expect.objectContaining({
        projectId: "project_123",
        userId: "user_owner",
        branchName: "repopress/hello",
        baseBranch: "main",
      }),
    )
  })

  it("uses a multi-change branch scope when create-new spans multiple areas", async () => {
    vi.mocked(getFile).mockResolvedValue(null as never)
    mockPublishQueries({
      pendingOps: [
        {
          _id: "explorer_op_1",
          opType: "create",
          filePath: "guides/getting-started.mdx",
          initialBody: "# Getting started",
          initialFrontmatter: { title: "Getting started" },
        },
      ],
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
      existingBranchNames: ["repopress/main/1234"],
      refreshedPublishBranch: {
        _id: "publish_branch_2",
        branchName: "repopress/multi-change",
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
    expect(createBranch).toHaveBeenCalledWith("gh-token", "acme", "docs-site", "main", "repopress/multi-change")
    expect(createPullRequest).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      "repopress/multi-change",
      "main",
      "Content update via RepoPress (1 created, 1 updated) (PR from RepoPress)",
      "Automated content update from RepoPress.\n\n- 1 created\n- 1 updated",
    )
  })

  it("adds an ordinal suffix when the preferred scope branch name is already taken", async () => {
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
      existingBranchNames: ["repopress/main/1234", "repopress/hello", "repopress/hello-2"],
      refreshedPublishBranch: {
        _id: "publish_branch_2",
        branchName: "repopress/hello-3",
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
    expect(createBranch).toHaveBeenCalledWith("gh-token", "acme", "docs-site", "main", "repopress/hello-3")
    expect(createPullRequest).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      "repopress/hello-3",
      "main",
      "Content update via RepoPress (1 updated) (PR from RepoPress)",
      "Automated content update from RepoPress.\n\n- 1 updated",
    )
  })

  it("updates the existing PR title and description when reuse-current receives custom copy", async () => {
    const response = await POST(
      buildRequest({
        projectId: "project_123",
        publishMode: "reuse-current",
        title: "docs: tighten publish UX (PR from RepoPress)",
        description: "Refresh the copy and branch naming for publish flows.",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(createPullRequest).not.toHaveBeenCalled()
    expect(updatePullRequest).toHaveBeenCalledWith("gh-token", "acme", "docs-site", 42, {
      title: "docs: tighten publish UX (PR from RepoPress)",
      body: "Refresh the copy and branch naming for publish flows.",
    })
  })

  it("keeps the publish successful when the existing PR metadata update fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(updatePullRequest).mockRejectedValueOnce(new Error("GitHub PR update failed"))

    const response = await POST(
      buildRequest({
        projectId: "project_123",
        publishMode: "reuse-current",
        title: "docs: tighten publish UX (PR from RepoPress)",
        description: "Refresh the copy and branch naming for publish flows.",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.warning).toBe("Commit pushed, but updating the existing PR title/description failed.")
    expect(batchCommit).toHaveBeenCalledTimes(1)
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "publish_branch_1",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
        lastCommitSha: "commit-sha-1",
      }),
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to update existing PR metadata:", expect.any(Error))
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

  it("detects file overlap with inactive publish branches when create-new is requested", async () => {
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
      existingBranchNames: ["repopress/main/1234", "repopress/main/8888"],
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
    expect(payload.overlaps).toBeDefined()
    expect(payload.overlaps.length).toBeGreaterThan(0)
  })

  it("skips current lane when checking overlaps in create-new flow", async () => {
    vi.mocked(getFile).mockResolvedValue(null as never)
    mockPublishQueries({
      pendingOps: [
        {
          _id: "explorer_op_1",
          opType: "create",
          filePath: "posts/shared-file.mdx",
          initialBody: "# Shared",
          initialFrontmatter: { title: "Shared" },
        },
      ],
      dirtyDocs: [],
      pendingMediaOps: [],
      currentPublishBranch: {
        _id: "publish_branch_current",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
        status: "active",
        committedFilePaths: ["content/posts/shared-file.mdx"],
      },
      openPublishBranches: [
        {
          _id: "publish_branch_current",
          branchName: "repopress/main/1234",
          prNumber: 42,
          status: "active",
          committedFilePaths: ["content/posts/shared-file.mdx"],
        },
      ],
      existingBranchNames: ["repopress/main/1234"],
      refreshedPublishBranch: {
        _id: "publish_branch_2",
        branchName: "repopress/new-lane",
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

    // Current lane overlap is allowed because it's being replaced
    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.publishModeUsed).toBe("create-new")
  })

  it("returns 409 when create-new loses the race to create the next active lane", async () => {
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
      existingBranchNames: ["repopress/main/1234"],
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
    expect(createBranch).toHaveBeenCalledWith("gh-token", "acme", "docs-site", "main", "repopress/hello")
    expect(createGitHubClient).toHaveBeenCalledWith("gh-token")
    expect(deleteRefMock).toHaveBeenCalledWith({
      owner: "acme",
      repo: "docs-site",
      ref: "heads/repopress/hello",
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
      existingBranchNames: ["repopress/main/1234"],
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
      ref: "heads/repopress/hello",
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

  it("publishes Convex-backed media from the storage URL returned by Convex", async () => {
    vi.mocked(getFile).mockResolvedValue(null as never)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([4, 5, 6]).buffer),
    } as never)
    convexQueryMock.mockReset()
    convexQueryMock
      .mockResolvedValueOnce(baseProject)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          _id: "media_op_convex_1",
          projectId: "project_123",
          repoPath: "/public/uploads/convex-hero.png",
          sourceType: "convex",
          convexStorageId: "convex-storage-id-1",
        },
      ])
      .mockResolvedValueOnce("https://files.convex.cloud/storage/convex-storage-id-1")
      .mockResolvedValueOnce({
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
        committedFilePaths: [],
      })

    const response = await POST(
      buildRequest({
        projectId: "project_123",
      }),
    )

    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith("https://files.convex.cloud/storage/convex-storage-id-1", {
      cache: "no-store",
    })
    expect(fetchSpy).not.toHaveBeenCalledWith("https://example.convex.site/api/storage/convex-storage-id-1", {
      cache: "no-store",
    })
    expect(batchCommit).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      "repopress/main/1234",
      expect.arrayContaining([
        expect.objectContaining({
          path: "public/uploads/convex-hero.png",
          action: "create",
          contentEncoding: "base64",
          content: Buffer.from(Uint8Array.from([4, 5, 6])).toString("base64"),
        }),
      ]),
      "chore(content): 1 media created via RepoPress",
    )
  })
})
