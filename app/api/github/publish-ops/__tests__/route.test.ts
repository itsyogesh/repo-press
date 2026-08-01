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
  batchCommitPublishLaneAtExpectedHead: vi.fn(),
  branchExists: vi.fn(),
  BranchHeadMovedError: class BranchHeadMovedError extends Error {},
  createPublishBranchFromSha: vi.fn(),
  createGitHubClient: vi.fn(),
  createPullRequest: vi.fn(),
  findOpenPublishLanePullRequest: vi.fn(),
  getBranchHeadForPublish: vi.fn(),
  getCommitDetailsForPublish: vi.fn(),
  getFile: vi.fn(),
  getFileForPublish: vi.fn(),
  inspectPublishEffectsAtCommit: vi.fn(),
  GitHubReadError: class GitHubReadError extends Error {},
  verifyPublishAttemptCommitForPublish: vi.fn(),
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
  BranchHeadMovedError,
  batchCommitPublishLaneAtExpectedHead,
  branchExists,
  createGitHubClient,
  createPublishBranchFromSha,
  createPullRequest,
  findOpenPublishLanePullRequest,
  GitHubReadError,
  getBranchHeadForPublish,
  getCommitDetailsForPublish,
  getFile,
  getFileForPublish,
  inspectPublishEffectsAtCommit,
  updatePullRequest,
  verifyPublishAttemptCommitForPublish,
} from "@/lib/github"
import { getRepoRole } from "@/lib/github-permissions"
import { POST } from "../route"

const PLAN_DIGEST = "d".repeat(64)

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
  activePublishAttempt = null,
  attemptLane = null,
  existingBranchNames = [],
  refreshedPublishBranch,
}: {
  pendingOps?: Array<Record<string, unknown>>
  dirtyDocs?: Array<Record<string, unknown>>
  pendingMediaOps?: Array<Record<string, unknown>>
  currentPublishBranch?: Record<string, unknown> | null
  openPublishBranches?: Array<Record<string, unknown>>
  activePublishAttempt?: Record<string, unknown> | null
  attemptLane?: Record<string, unknown> | null
  existingBranchNames?: string[]
  refreshedPublishBranch?: Record<string, unknown>
}) {
  const taggedPendingOps = pendingOps.map((op) => ({ pathRepresentation: "content_relative_v1", ...op }))
  const taggedDirtyDocs = dirtyDocs.map((doc) => ({ pathRepresentation: "content_relative_v1", ...doc }))
  convexQueryMock.mockReset()
  convexQueryMock
    .mockResolvedValueOnce(baseProject)
    .mockResolvedValueOnce(taggedPendingOps)
    .mockResolvedValueOnce(taggedDirtyDocs)
    .mockResolvedValueOnce(pendingMediaOps)
    .mockResolvedValueOnce(activePublishAttempt)

  if (activePublishAttempt) {
    convexQueryMock.mockResolvedValueOnce(attemptLane)
  }

  convexQueryMock.mockResolvedValueOnce(currentPublishBranch)

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
    vi.mocked(batchCommitPublishLaneAtExpectedHead).mockResolvedValue({ commitSha: "commit-sha-1" } as never)
    vi.mocked(getFile).mockResolvedValue({ sha: "new-sha-1" } as never)
    vi.mocked(getFileForPublish).mockImplementation(async (...callArgs: unknown[]) => {
      const path = String(callArgs[3])
      const ref = String(callArgs[4])
      // Post-commit reconciliation reads at the landed commit; default them
      // to found so the happy path reconciles. Preflight reads (authority
      // SHAs) default to absent.
      if (ref.startsWith("commit-sha") || ref === "landed-sha-1") {
        return { status: "found", file: { content: "", sha: "synced-sha", name: "", path } }
      }
      return { status: "absent" }
    })
    vi.mocked(getBranchHeadForPublish).mockResolvedValue({ status: "found", sha: "authority-sha-1" } as never)
    vi.mocked(findOpenPublishLanePullRequest).mockResolvedValue(null as never)
    vi.mocked(verifyPublishAttemptCommitForPublish).mockResolvedValue(true)
    convexMutationMock.mockResolvedValue(undefined as never)
    vi.mocked(branchExists).mockResolvedValue(false)
    vi.mocked(createPublishBranchFromSha).mockResolvedValue(undefined as never)
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
    expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalled()
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
    expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
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
    expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
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
    expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalled()
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
    expect(createPublishBranchFromSha).not.toHaveBeenCalled()
    expect(createPullRequest).not.toHaveBeenCalled()
    // No publishBranches.create call (its args are the only ones carrying
    // baseBranch); the durable publishAttempts.begin call is expected.
    expect(convexMutationMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ projectId: "project_123", baseBranch: "main" }),
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
    expect(createPublishBranchFromSha).toHaveBeenCalledTimes(1)
    expect(createPublishBranchFromSha).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      "repopress/hello",
      "authority-sha-1",
    )
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
    expect(createPublishBranchFromSha).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      "repopress/multi-change",
      "authority-sha-1",
    )
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
    expect(createPublishBranchFromSha).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      "repopress/hello-3",
      "authority-sha-1",
    )
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
    expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledTimes(1)
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
    expect(createPublishBranchFromSha).not.toHaveBeenCalled()
    expect(createPullRequest).not.toHaveBeenCalled()
    expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
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
    expect(createPublishBranchFromSha).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      "repopress/hello",
      "authority-sha-1",
    )
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
    expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
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
    expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
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
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        mediaAssociations: [expect.objectContaining({ mediaOpId: "media_op_1", repoPath: "public/uploads/hero.png" })],
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
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
        committedFilePaths: [],
      })
      .mockResolvedValueOnce("https://files.convex.cloud/storage/convex-storage-id-1")

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
    expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      { branch: "repopress/main/1234", protectedBaseBranch: "main", expectedHeadSha: "authority-sha-1" },
      expect.arrayContaining([
        expect.objectContaining({
          path: "public/uploads/convex-hero.png",
          action: "create",
          contentEncoding: "base64",
          content: Buffer.from(Uint8Array.from([4, 5, 6])).toString("base64"),
        }),
      ]),
      expect.stringContaining("chore(content): 1 media created via RepoPress"),
    )
  })

  it("resolves a nested-root canonical document path exactly once", async () => {
    convexQueryMock.mockReset()
    convexQueryMock
      .mockResolvedValueOnce({ ...baseProject, contentRoot: "content/docs" })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          _id: "doc_nested_1",
          filePath: "guides/start.mdx",
          pathRepresentation: "content_relative_v1",
          body: "# Start",
          frontmatter: { title: "Start" },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
      })

    const response = await POST(buildRequest({ projectId: "project_123" }))

    expect(response.status).toBe(200)
    expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      { branch: "repopress/main/1234", protectedBaseBranch: "main", expectedHeadSha: "authority-sha-1" },
      [expect.objectContaining({ path: "content/docs/guides/start.mdx", action: "update" })],
      expect.stringContaining("chore(content): 1 updated via RepoPress"),
    )
  })

  it("associates create operations and dirty documents by their normalized repository identity", async () => {
    vi.mocked(getFile).mockResolvedValue(null as never)
    mockPublishQueries({
      pendingOps: [
        {
          _id: "explorer_op_nfd",
          opType: "create",
          filePath: "guides/cafe\u0301.mdx",
          initialBody: "# Initial",
          initialFrontmatter: { title: "Initial" },
        },
      ],
      dirtyDocs: [
        {
          _id: "doc_nfc",
          filePath: "guides/café.mdx",
          body: "# Draft",
          frontmatter: { title: "Draft" },
          updatedAt: 100,
        },
      ],
    })

    const response = await POST(buildRequest({ projectId: "project_123" }))

    expect(response.status).toBe(200)
    expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      { branch: "repopress/main/1234", protectedBaseBranch: "main", expectedHeadSha: "authority-sha-1" },
      [
        expect.objectContaining({
          path: "content/guides/café.mdx",
          action: "create",
          content: expect.stringContaining("# Draft"),
        }),
      ],
      expect.stringContaining("chore(content): 1 created via RepoPress"),
    )
  })

  it("publishes untagged legacy document rows through explicit repository-relative compatibility", async () => {
    convexQueryMock.mockReset()
    convexQueryMock
      .mockResolvedValueOnce({ ...baseProject, contentRoot: "content/docs" })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          _id: "doc_legacy_1",
          filePath: "content/docs/guides/legacy.mdx",
          body: "# Legacy",
          frontmatter: { title: "Legacy" },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
      })

    const response = await POST(buildRequest({ projectId: "project_123" }))

    expect(response.status).toBe(200)
    expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      { branch: "repopress/main/1234", protectedBaseBranch: "main", expectedHeadSha: "authority-sha-1" },
      [expect.objectContaining({ path: "content/docs/guides/legacy.mdx", action: "update" })],
      expect.stringContaining("chore(content): 1 updated via RepoPress"),
    )
  })

  it("publishes a canonical delete operation without also updating its dirty document", async () => {
    mockPublishQueries({
      pendingOps: [{ _id: "explorer_op_delete", opType: "delete", filePath: "guides/start.mdx" }],
      dirtyDocs: [
        {
          _id: "doc_dirty",
          filePath: "guides/start.mdx",
          body: "# Draft",
          frontmatter: { title: "Draft" },
          updatedAt: 100,
        },
      ],
    })

    const response = await POST(buildRequest({ projectId: "project_123" }))
    expect(response.status).toBe(200)
    expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      { branch: "repopress/main/1234", protectedBaseBranch: "main", expectedHeadSha: "authority-sha-1" },
      [{ path: "content/guides/start.mdx", action: "delete" }],
      expect.stringContaining("chore(content): 1 deleted via RepoPress"),
    )
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ids: ["explorer_op_delete"],
        deleteAssociations: [{ opId: "explorer_op_delete", documentId: "doc_dirty", expectedUpdatedAt: 100 }],
      }),
    )
  })

  it("associates untagged legacy delete operations with legacy dirty documents", async () => {
    convexQueryMock.mockReset()
    convexQueryMock
      .mockResolvedValueOnce({ ...baseProject, contentRoot: "content/docs" })
      .mockResolvedValueOnce([
        { _id: "explorer_op_legacy", opType: "delete", filePath: "content/docs/guides/legacy.mdx" },
      ])
      .mockResolvedValueOnce([
        {
          _id: "doc_legacy",
          filePath: "content/docs/guides/legacy.mdx",
          body: "# Legacy draft",
          frontmatter: { title: "Legacy" },
          updatedAt: 100,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: "publish_branch_1",
        branchName: "repopress/main/1234",
        prNumber: 42,
        prUrl: "https://github.com/acme/docs-site/pull/42",
      })

    const response = await POST(buildRequest({ projectId: "project_123" }))

    expect(response.status).toBe(200)
    expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      { branch: "repopress/main/1234", protectedBaseBranch: "main", expectedHeadSha: "authority-sha-1" },
      [{ path: "content/docs/guides/legacy.mdx", action: "delete" }],
      expect.stringContaining("chore(content): 1 deleted via RepoPress"),
    )
    expect(convexMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ids: ["explorer_op_legacy"],
        deleteAssociations: [{ opId: "explorer_op_legacy", documentId: "doc_legacy", expectedUpdatedAt: 100 }],
      }),
    )
  })

  it.each([
    ["canonical", "guides/repeat.mdx", "content_relative_v1", "content/guides/repeat.mdx"],
    ["legacy", "content/docs/guides/repeat.mdx", undefined, "content/docs/guides/repeat.mdx"],
  ])("does not resurrect a %s deleted dirty document on the next publish", async (_label, filePath, pathRepresentation, expectedRepoPath) => {
    const project = {
      ...baseProject,
      contentRoot: pathRepresentation ? "content" : "content/docs",
    }
    const op = { _id: "op_repeat", opType: "delete", filePath, pathRepresentation }
    const doc = {
      _id: "doc_repeat",
      filePath,
      pathRepresentation,
      body: "# Dirty",
      frontmatter: { title: "Dirty" },
      updatedAt: 100,
    }
    const currentBranch = {
      _id: "publish_branch_1",
      branchName: "repopress/main/1234",
      prNumber: 42,
      prUrl: "https://github.com/acme/docs-site/pull/42",
    }
    convexQueryMock.mockReset()
    convexQueryMock
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce([op])
      .mockResolvedValueOnce([doc])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(currentBranch)
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(null)

    const firstResponse = await POST(buildRequest({ projectId: "project_123" }))
    const secondResponse = await POST(buildRequest({ projectId: "project_123" }))

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(400)
    expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledTimes(1)
    expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "docs-site",
      { branch: "repopress/main/1234", protectedBaseBranch: "main", expectedHeadSha: "authority-sha-1" },
      [{ path: expectedRepoPath, action: "delete" }],
      expect.stringContaining("chore(content): 1 deleted via RepoPress"),
    )
  })

  it("rejects a delete when its dirty document was saved after the delete was staged", async () => {
    mockPublishQueries({
      pendingOps: [
        {
          _id: "op_stale_delete",
          opType: "delete",
          filePath: "guides/stale.mdx",
          createdAt: 100,
        },
      ],
      dirtyDocs: [
        {
          _id: "doc_newer",
          filePath: "guides/stale.mdx",
          body: "# Newer draft",
          frontmatter: { title: "Newer" },
          updatedAt: 101,
        },
      ],
    })

    const response = await POST(buildRequest({ projectId: "project_123" }))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.conflicts).toEqual([
      expect.objectContaining({ path: "content/guides/stale.mdx", reason: expect.stringContaining("after delete") }),
    ])
    expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
  })

  it("rejects duplicate pending operations for the same normalized repository path", async () => {
    mockPublishQueries({
      pendingOps: [
        { _id: "explorer_op_nfd", opType: "delete", filePath: "guides/cafe\u0301.mdx" },
        { _id: "explorer_op_nfc", opType: "delete", filePath: "guides/café.mdx" },
      ],
      dirtyDocs: [],
    })

    const response = await POST(buildRequest({ projectId: "project_123" }))

    expect(response.status).toBe(409)
    expect(getFile).not.toHaveBeenCalled()
    expect(getFileForPublish).not.toHaveBeenCalled()
    expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
  })

  describe("publish integrity", () => {
    it("aborts with 502 before any commit when a preflight read fails for a non-404 reason", async () => {
      vi.mocked(getFileForPublish).mockRejectedValue(
        new GitHubReadError("GitHub read failed for content/posts/hello.mdx (status: 500)"),
      )

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(502)
      expect(payload.ok).toBe(false)
      expect(payload.error).toMatch(/aborted before any commit/i)
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
      expect(createPullRequest).not.toHaveBeenCalled()
    })

    it("prefetches dirty documents even when they have no githubSha", async () => {
      const response = await POST(buildRequest({ projectId: "project_123" }))

      expect(response.status).toBe(200)
      expect(getFileForPublish).toHaveBeenCalledWith(
        "gh-token",
        "acme",
        "docs-site",
        "content/posts/hello.mdx",
        "authority-sha-1",
      )
    })

    it("preserves a metadata-export document verbatim instead of prepending YAML", async () => {
      const body = 'export const metadata = {\n  "title": "Hello"\n}\n\n# Body (edited)\n'
      mockPublishQueries({
        dirtyDocs: [{ _id: "doc_1", filePath: "posts/hello.mdx", body, frontmatter: {} }],
      })
      vi.mocked(getFileForPublish).mockResolvedValue({
        status: "found",
        file: {
          content: 'export const metadata = {\n  "title": "Hello"\n}\n\n# Old body\n',
          sha: "sha-old",
          name: "hello.mdx",
          path: "content/posts/hello.mdx",
        },
      } as never)

      const response = await POST(buildRequest({ projectId: "project_123" }))

      expect(response.status).toBe(200)
      const operations = vi.mocked(batchCommitPublishLaneAtExpectedHead).mock.calls[0][4]
      expect(operations).toEqual([
        expect.objectContaining({ path: "content/posts/hello.mdx", action: "update", content: body }),
      ])
      expect(operations[0].content).not.toMatch(/^---/)
    })

    it("re-emits export const metadata for a legacy stripped draft instead of converting to YAML", async () => {
      mockPublishQueries({
        dirtyDocs: [{ _id: "doc_1", filePath: "posts/hello.mdx", body: "# Body\n", frontmatter: { title: "Hello" } }],
      })
      vi.mocked(getFileForPublish).mockResolvedValue({
        status: "found",
        file: {
          content: 'export const metadata = { title: "Old" }\n\n# Old body\n',
          sha: "sha-old",
          name: "hello.mdx",
          path: "content/posts/hello.mdx",
        },
      } as never)

      const response = await POST(buildRequest({ projectId: "project_123" }))

      expect(response.status).toBe(200)
      const operations = vi.mocked(batchCommitPublishLaneAtExpectedHead).mock.calls[0][4]
      expect(operations[0].content).toMatch(/^export const metadata = \{/)
      expect(operations[0].content).toContain('"title": "Hello"')
      expect(operations[0].content).not.toMatch(/^---/)
    })

    it("returns 409 instead of publishing duplicate metadata when an export-embedding body also has frontmatter", async () => {
      const body = 'export const metadata = { title: "Embedded" }\n\n# Body\n'
      mockPublishQueries({
        dirtyDocs: [{ _id: "doc_1", filePath: "posts/hello.mdx", body, frontmatter: { title: "Panel" } }],
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(409)
      expect(payload.conflicts).toEqual([
        expect.objectContaining({ path: "content/posts/hello.mdx", reason: expect.stringMatching(/metadata/i) }),
      ])
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("surfaces skipped delete associations as a warning while the publish still succeeds", async () => {
      mockPublishQueries({
        pendingOps: [
          {
            _id: "op_delete",
            opType: "delete",
            filePath: "posts/old.mdx",
            createdAt: 1_000,
          },
        ],
        dirtyDocs: [{ _id: "doc_1", filePath: "posts/old.mdx", body: "# Old\n", frontmatter: {}, updatedAt: 900 }],
      })
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object" && "deleteAssociations" in (args as Record<string, unknown>)) {
          return {
            skippedDeleteAssociations: [
              { opId: "op_delete", documentId: "doc_1", reason: "document-changed-after-snapshot" },
            ],
          }
        }
        return undefined
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.ok).toBe(true)
      expect(payload.warning).toMatch(/kept their draft content/i)
    })

    it("pins two consecutive publishes to the advancing lane head, not the base branch", async () => {
      const first = await POST(buildRequest({ projectId: "project_123" }))
      expect(first.status).toBe(200)
      expect(getBranchHeadForPublish).toHaveBeenLastCalledWith("gh-token", "acme", "docs-site", "repopress/main/1234")
      expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenLastCalledWith(
        "gh-token",
        "acme",
        "docs-site",
        { branch: "repopress/main/1234", protectedBaseBranch: "main", expectedHeadSha: "authority-sha-1" },
        expect.anything(),
        expect.any(String),
      )

      // The lane head advanced (our own first commit). The second publish
      // must plan against the NEW lane head for both reads and the CAS.
      mockPublishQueries({})
      vi.mocked(getBranchHeadForPublish).mockResolvedValue({ status: "found", sha: "commit-sha-1" } as never)
      vi.mocked(batchCommitPublishLaneAtExpectedHead).mockResolvedValue({ commitSha: "commit-sha-2" } as never)

      const second = await POST(buildRequest({ projectId: "project_123" }))
      expect(second.status).toBe(200)
      // The second publish's PREFLIGHT read is pinned to the advanced lane
      // head (the post-commit refresh reads at commit-sha-2 afterwards).
      expect(getFileForPublish).toHaveBeenCalledWith(
        "gh-token",
        "acme",
        "docs-site",
        "content/posts/hello.mdx",
        "commit-sha-1",
      )
      expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenLastCalledWith(
        "gh-token",
        "acme",
        "docs-site",
        { branch: "repopress/main/1234", protectedBaseBranch: "main", expectedHeadSha: "commit-sha-1" },
        expect.anything(),
        expect.any(String),
      )
    })

    it("returns 409 and supersedes the attempt when the lane head moves during the CAS commit", async () => {
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object" && "planDigest" in (args as Record<string, unknown>)) {
          return "attempt_1"
        }
        return undefined
      })
      vi.mocked(batchCommitPublishLaneAtExpectedHead).mockRejectedValue(new BranchHeadMovedError("repopress/main/1234"))

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(409)
      expect(payload.error).toMatch(/advanced while publishing/i)
      // The stranded attempt is superseded (an id-only mutation) and no
      // commit is ever recorded.
      expect(convexMutationMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "attempt_1" }))
      expect(convexMutationMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ commitSha: expect.anything() }),
      )
    })

    it("recovers a committing attempt from git evidence on retry without committing again", async () => {
      // A previous publish crashed after its CAS commit landed but before
      // recordCommit: the lane head advanced past the attempt's expected
      // head and the head commit carries the attempt trailer.
      const attempt = {
        _id: "attempt_1",
        projectId: "project_123",
        publishBranchId: "publish_branch_1",
        branchName: "repopress/main/1234",
        expectedHeadSha: "authority-sha-1",
        planDigest: PLAN_DIGEST,
        operationDescriptors: [{ path: "content/posts/old.mdx", action: "delete" }],
        operationPaths: ["content/posts/old.mdx"],
        opIds: ["op_delete"],
        mediaAssociations: [],
        documentAssociations: [],
        deleteAssociations: [{ opId: "op_delete", documentId: "doc_1", expectedUpdatedAt: 900 }],
        status: "committing",
      }
      mockPublishQueries({
        pendingOps: [{ _id: "op_delete", opType: "delete", filePath: "posts/old.mdx", createdAt: 1_000 }],
        dirtyDocs: [],
        activePublishAttempt: attempt,
        attemptLane: {
          _id: "publish_branch_1",
          projectId: "project_123",
          branchName: "repopress/main/1234",
          prNumber: 42,
          prUrl: "https://github.com/acme/docs-site/pull/42",
        },
      })
      vi.mocked(getBranchHeadForPublish).mockResolvedValue({ status: "found", sha: "commit-sha-1" } as never)
      vi.mocked(getCommitDetailsForPublish).mockResolvedValue({
        message: `chore(content): 1 deleted via RepoPress\n\nRepoPress-Publish-Attempt: ${PLAN_DIGEST}`,
        parents: ["authority-sha-1"],
      } as never)
      const markCommittedCalls: unknown[] = []
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object" && "deleteAssociations" in (args as Record<string, unknown>)) {
          markCommittedCalls.push(args)
          return { skippedDeleteAssociations: [], unreconciledOpIds: [] }
        }
        return undefined
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.ok).toBe(true)
      expect(payload.recovered).toBe(true)
      expect(payload.commitSha).toBe("commit-sha-1")
      // The retry reconciles the landed commit - it never commits again.
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
      expect(markCommittedCalls).toEqual([expect.objectContaining({ ids: ["op_delete"], commitSha: "commit-sha-1" })])
      // recordCommit persisted the recovered SHA on the attempt.
      expect(convexMutationMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "attempt_1", commitSha: "commit-sha-1" }),
      )
      expect(verifyPublishAttemptCommitForPublish).toHaveBeenCalledWith(
        "gh-token",
        "acme",
        "docs-site",
        "authority-sha-1",
        "commit-sha-1",
        [{ path: "content/posts/old.mdx", action: "delete" }],
      )
    })

    it("fails closed instead of adopting a trailer-matching commit with the wrong tree", async () => {
      mockPublishQueries({
        activePublishAttempt: committedAttempt({ status: "committing", commitSha: undefined }),
        attemptLane: recoveryLane,
      })
      vi.mocked(getBranchHeadForPublish).mockResolvedValue({ status: "found", sha: "commit-sha-1" } as never)
      vi.mocked(getCommitDetailsForPublish).mockResolvedValue({
        message: `chore(content): via RepoPress\n\nRepoPress-Publish-Attempt: ${PLAN_DIGEST}`,
        parents: ["authority-sha-1"],
      } as never)
      vi.mocked(verifyPublishAttemptCommitForPublish).mockResolvedValue(false)

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(409)
      expect(payload.error).toMatch(/cannot prove/i)
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
      expect(convexMutationMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "attempt_1", commitSha: expect.anything() }),
      )
    })

    it("recovers a committed attempt directly from its recorded SHA without GitHub reads", async () => {
      const attempt = {
        _id: "attempt_1",
        projectId: "project_123",
        publishBranchId: "publish_branch_1",
        branchName: "repopress/main/1234",
        expectedHeadSha: "authority-sha-1",
        planDigest: PLAN_DIGEST,
        operationDescriptors: [{ path: "content/posts/old.mdx", action: "delete" }],
        operationPaths: ["content/posts/old.mdx"],
        opIds: ["op_delete"],
        mediaAssociations: [],
        documentAssociations: [],
        deleteAssociations: [],
        status: "committed",
        commitSha: "commit-sha-1",
      }
      mockPublishQueries({
        pendingOps: [{ _id: "op_delete", opType: "delete", filePath: "posts/old.mdx", createdAt: 1_000 }],
        dirtyDocs: [],
        activePublishAttempt: attempt,
        attemptLane: {
          _id: "publish_branch_1",
          projectId: "project_123",
          branchName: "repopress/main/1234",
          prNumber: 42,
          prUrl: "https://github.com/acme/docs-site/pull/42",
        },
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.recovered).toBe(true)
      expect(payload.commitSha).toBe("commit-sha-1")
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
      expect(getBranchHeadForPublish).not.toHaveBeenCalled()
      expect(getCommitDetailsForPublish).not.toHaveBeenCalled()
    })

    it("supersedes an attempt whose commit provably never landed and publishes fresh", async () => {
      const attempt = {
        _id: "attempt_stale",
        projectId: "project_123",
        publishBranchId: "publish_branch_1",
        branchName: "repopress/main/1234",
        expectedHeadSha: "authority-sha-1",
        planDigest: PLAN_DIGEST,
        operationDescriptors: [],
        operationPaths: [],
        opIds: [],
        mediaAssociations: [],
        documentAssociations: [],
        deleteAssociations: [],
        status: "committing",
      }
      mockPublishQueries({
        activePublishAttempt: attempt,
        attemptLane: {
          _id: "publish_branch_1",
          projectId: "project_123",
          branchName: "repopress/main/1234",
          prNumber: 42,
          prUrl: "https://github.com/acme/docs-site/pull/42",
        },
      })
      // Lane head still exactly at the attempt's expected head: not landed.
      vi.mocked(getBranchHeadForPublish).mockResolvedValue({ status: "found", sha: "authority-sha-1" } as never)

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.ok).toBe(true)
      expect(payload.recovered).toBeUndefined()
      // Superseded, then the fresh publish committed normally.
      expect(convexMutationMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "attempt_stale" }),
      )
      expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledTimes(1)
    })

    it("surfaces concurrently undone operations as a divergence warning", async () => {
      mockPublishQueries({
        pendingOps: [{ _id: "op_undone", opType: "delete", filePath: "posts/old.mdx", createdAt: 1_000 }],
        dirtyDocs: [],
      })
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object" && "deleteAssociations" in (args as Record<string, unknown>)) {
          return { skippedDeleteAssociations: [], unreconciledOpIds: ["op_undone"] }
        }
        return undefined
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.warning).toMatch(/undone while publishing/i)
    })

    const recoveryLane = {
      _id: "publish_branch_1",
      projectId: "project_123",
      branchName: "repopress/main/1234",
      prNumber: 42,
      prUrl: "https://github.com/acme/docs-site/pull/42",
    }

    function committedAttempt(overrides: Record<string, unknown> = {}) {
      return {
        _id: "attempt_1",
        projectId: "project_123",
        publishBranchId: "publish_branch_1",
        branchName: "repopress/main/1234",
        expectedHeadSha: "authority-sha-1",
        planDigest: PLAN_DIGEST,
        operationDescriptors: [{ path: "content/posts/old.mdx", action: "delete" }],
        operationPaths: ["content/posts/old.mdx"],
        opIds: [],
        mediaAssociations: [],
        documentAssociations: [],
        deleteAssociations: [],
        status: "committed",
        commitSha: "commit-sha-1",
        ...overrides,
      }
    }

    it("recovers a stranded attempt even when nothing is pending anymore", async () => {
      // A crash after markCommitted left ops committed (nothing pending) but
      // the attempt unreconciled. Recovery must run BEFORE the no-pending
      // 400.
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        pendingMediaOps: [],
        activePublishAttempt: committedAttempt(),
        attemptLane: recoveryLane,
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.recovered).toBe(true)
      expect(payload.commitSha).toBe("commit-sha-1")
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("recovers before applying the new request's create-new publishMode", async () => {
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        activePublishAttempt: committedAttempt(),
        attemptLane: recoveryLane,
      })

      const response = await POST(buildRequest({ projectId: "project_123", publishMode: "create-new" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.recovered).toBe(true)
      // Recovery targeted the attempt's own lane; the new request's mode
      // never influenced it (no overlap checks, no lane deactivation).
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("fails closed with 500 when the attempt's lane no longer matches", async () => {
      mockPublishQueries({
        activePublishAttempt: committedAttempt(),
        attemptLane: { ...recoveryLane, branchName: "repopress/other-lane" },
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(500)
      expect(payload.error).toMatch(/no longer matches this project/i)
      // Fail closed: no attempt mutation (supersede/record/reconcile) and no
      // commit. (The auth layer's cache write goes through the same client,
      // so assert the targeted absence, not zero calls.)
      expect(convexMutationMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "attempt_1" }),
      )
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("finds a landed commit deeper in linear ancestry instead of superseding", async () => {
      // Someone committed on top of our landed commit: head has no trailer,
      // but its single parent does.
      mockPublishQueries({
        activePublishAttempt: committedAttempt({ status: "committing", commitSha: undefined }),
        attemptLane: recoveryLane,
      })
      vi.mocked(getBranchHeadForPublish).mockResolvedValue({ status: "found", sha: "foreign-sha-2" } as never)
      vi.mocked(getCommitDetailsForPublish).mockImplementation(
        async (_t: unknown, _o: unknown, _r: unknown, sha: unknown) => {
          if (sha === "foreign-sha-2") {
            return { message: "chore: unrelated commit", parents: ["landed-sha-1"] }
          }
          if (sha === "landed-sha-1") {
            return {
              message: `chore(content): via RepoPress\n\nRepoPress-Publish-Attempt: ${PLAN_DIGEST}`,
              parents: ["authority-sha-1"],
            }
          }
          throw new Error(`unexpected sha ${String(sha)}`)
        },
      )

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.recovered).toBe(true)
      expect(payload.commitSha).toBe("landed-sha-1")
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("fails closed on non-linear history instead of superseding", async () => {
      mockPublishQueries({
        activePublishAttempt: committedAttempt({ status: "committing", commitSha: undefined }),
        attemptLane: recoveryLane,
      })
      vi.mocked(getBranchHeadForPublish).mockResolvedValue({ status: "found", sha: "merge-sha" } as never)
      vi.mocked(getCommitDetailsForPublish).mockResolvedValue({
        message: "Merge branch",
        parents: ["parent-a", "parent-b"],
      } as never)

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(409)
      expect(payload.error).toMatch(/cannot prove/i)
      // No supersede, no recordCommit, no new commit.
      expect(convexMutationMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "attempt_1" }),
      )
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("fails closed when the lane branch is gone while an attempt is committing", async () => {
      mockPublishQueries({
        activePublishAttempt: committedAttempt({ status: "committing", commitSha: undefined }),
        attemptLane: recoveryLane,
      })
      vi.mocked(getBranchHeadForPublish).mockResolvedValue({ status: "absent" } as never)

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(409)
      expect(payload.error).toMatch(/cannot prove whether its commit landed/i)
      expect(convexMutationMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "attempt_1" }),
      )
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("refreshes stored document SHAs at the landed commit during recovery", async () => {
      mockPublishQueries({
        activePublishAttempt: committedAttempt({
          documentAssociations: [{ documentId: "doc_9", repoPath: "content/posts/hello.mdx" }],
        }),
        attemptLane: recoveryLane,
      })
      vi.mocked(getFileForPublish).mockImplementation(async (...callArgs: unknown[]) => {
        const path = String(callArgs[3])
        return { status: "found", file: { content: "", sha: "refreshed-sha", name: "", path } }
      })
      const documentUpdates: unknown[] = []
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object" && "githubSha" in (args as Record<string, unknown>)) {
          documentUpdates.push(args)
        }
        return undefined
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))

      expect(response.status).toBe(200)
      expect(getFileForPublish).toHaveBeenCalledWith(
        "gh-token",
        "acme",
        "docs-site",
        "content/posts/hello.mdx",
        "commit-sha-1",
      )
      expect(documentUpdates).toEqual([expect.objectContaining({ id: "doc_9", githubSha: "refreshed-sha" })])
    })

    it("adopts the existing lane PR when creation fails (idempotent ensure)", async () => {
      mockPublishQueries({
        currentPublishBranch: {
          _id: "publish_branch_1",
          branchName: "repopress/main/1234",
          prNumber: undefined,
          prUrl: undefined,
        },
      })
      vi.mocked(createPullRequest).mockRejectedValue(Object.assign(new Error("already exists"), { status: 422 }))
      vi.mocked(findOpenPublishLanePullRequest).mockResolvedValue({
        number: 7,
        htmlUrl: "https://github.com/acme/docs-site/pull/7",
      } as never)

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.ok).toBe(true)
      expect(payload.prNumber).toBe(7)
      expect(payload.prUrl).toBe("https://github.com/acme/docs-site/pull/7")
      expect(payload.warning).toBeUndefined()
    })

    it("surfaces concurrently undone media uploads as a divergence warning", async () => {
      mockPublishQueries({
        pendingMediaOps: [
          {
            _id: "media_1",
            projectId: "project_123",
            repoPath: "/public/uploads/pic.png",
            sourceType: "github",
            content: Buffer.from([1]).toString("base64"),
          },
        ],
      })
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (
          args &&
          typeof args === "object" &&
          "ids" in (args as Record<string, unknown>) &&
          !("deleteAssociations" in (args as Record<string, unknown>))
        ) {
          return { unreconciledMediaOpIds: ["media_1"] }
        }
        if (args && typeof args === "object" && "deleteAssociations" in (args as Record<string, unknown>)) {
          return { skippedDeleteAssociations: [], unreconciledOpIds: [] }
        }
        return undefined
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.warning).toMatch(/media upload\(s\) were undone/i)
    })

    it("returns 409 without committing when begin rejects a stale planned snapshot", async () => {
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object" && "planDigest" in (args as Record<string, unknown>)) {
          throw new Error("Staged changes changed since planning: a document was edited or discarded")
        }
        return undefined
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(409)
      expect(payload.error).toMatch(/aborted before any commit/i)
      expect(payload.error).toMatch(/changed since planning/i)
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("keeps the attempt retryable when document SHA refresh fails, then a retry reconciles without a second commit", async () => {
      // First request: the commit lands, but the post-commit SHA refresh
      // fails - the response stays ok with reconciliationIncomplete and the
      // attempt must NOT be marked reconciled.
      const attemptCalls: Array<Record<string, unknown>> = []
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object") {
          const record = args as Record<string, unknown>
          if ("planDigest" in record) return "attempt_1"
          if (record.id === "attempt_1") attemptCalls.push(record)
          if ("deleteAssociations" in record) return { skippedDeleteAssociations: [], unreconciledOpIds: [] }
        }
        return undefined
      })
      vi.mocked(getFileForPublish).mockImplementation(async (...callArgs: unknown[]) => {
        const ref = String(callArgs[4])
        if (ref.startsWith("commit-sha")) {
          // Real production failure mode: the TYPED read throws - nothing is
          // silently converted to null.
          throw new GitHubReadError("GitHub read failed (status: 500)")
        }
        return { status: "absent" }
      })

      const first = await POST(buildRequest({ projectId: "project_123" }))
      const firstPayload = await first.json()

      expect(first.status).toBe(200)
      expect(firstPayload.ok).toBe(true)
      expect(firstPayload.reconciliationIncomplete).toBe(true)
      expect(firstPayload.warning).toMatch(/publish again to finish reconciliation/i)
      expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledTimes(1)
      // recordCommit happened; markReconciled (id-only call) did not.
      expect(attemptCalls).toEqual([expect.objectContaining({ id: "attempt_1", commitSha: "commit-sha-1" })])

      // Retry: the attempt is still committed - recovery finishes the
      // refresh and reconciles WITHOUT a second Git commit.
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        activePublishAttempt: committedAttempt({
          documentAssociations: [{ documentId: "doc_1", repoPath: "content/posts/hello.mdx", expectedUpdatedAt: 900 }],
        }),
        attemptLane: recoveryLane,
      })
      const retryAttemptCalls: Array<Record<string, unknown>> = []
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object") {
          const record = args as Record<string, unknown>
          if (record.id === "attempt_1") retryAttemptCalls.push(record)
          if ("deleteAssociations" in record) return { skippedDeleteAssociations: [], unreconciledOpIds: [] }
        }
        return undefined
      })
      vi.mocked(getFileForPublish).mockImplementation(async (...callArgs: unknown[]) => {
        const path = String(callArgs[3])
        const ref = String(callArgs[4])
        if (ref.startsWith("commit-sha")) {
          return { status: "found", file: { content: "", sha: "refreshed-sha", name: "", path } }
        }
        return { status: "absent" }
      })

      const retry = await POST(buildRequest({ projectId: "project_123" }))
      const retryPayload = await retry.json()

      expect(retry.status).toBe(200)
      expect(retryPayload.recovered).toBe(true)
      expect(retryPayload.reconciliationIncomplete).toBeUndefined()
      // Still exactly ONE Git commit across both requests.
      expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledTimes(1)
      // markReconciled ran this time (id-only call, no commitSha).
      expect(retryAttemptCalls).toEqual([expect.objectContaining({ id: "attempt_1" })])
      expect(retryAttemptCalls[0].commitSha).toBeUndefined()
    })

    it("does not create a redundant commit when re-publishing unchanged created content", async () => {
      // First publish: a staged create with its dirty document lands.
      const body = "# Hello\n"
      mockPublishQueries({
        pendingOps: [{ _id: "op_create", opType: "create", filePath: "posts/hello.mdx", createdAt: 1 }],
        dirtyDocs: [{ _id: "doc_1", filePath: "posts/hello.mdx", body, frontmatter: {}, updatedAt: 5 }],
      })

      const first = await POST(buildRequest({ projectId: "project_123" }))
      expect(first.status).toBe(200)
      expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledTimes(1)

      // Second publish: the create op is committed (no longer pending), the
      // document is still dirty, and the lane now contains exactly the
      // published content. Nothing may be committed - but the document must
      // be reconciled clean instead of dead-ending as permanently dirty.
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [
          {
            _id: "doc_1",
            filePath: "posts/hello.mdx",
            body,
            frontmatter: {},
            updatedAt: 5,
            contentVersion: 3,
            githubSha: "blob-1",
          },
        ],
      })
      vi.mocked(getFileForPublish).mockResolvedValue({
        status: "found",
        file: { content: body, sha: "blob-1", name: "hello.mdx", path: "content/posts/hello.mdx" },
      } as never)
      const snapshotCalls: Array<Record<string, unknown>> = []
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object" && "publishBranchId" in (args as Record<string, unknown>)) {
          snapshotCalls.push(args as Record<string, unknown>)
        }
        return undefined
      })

      const second = await POST(buildRequest({ projectId: "project_123" }))
      const secondPayload = await second.json()

      expect(second.status).toBe(200)
      expect(secondPayload.ok).toBe(true)
      expect(secondPayload.synchronizedOnly).toBe(true)
      // The document's provenance now records the lane head as its holding
      // commit, at the planned content version - clean without a commit.
      expect(snapshotCalls).toEqual([
        expect.objectContaining({
          id: "doc_1",
          authorityKind: "lane",
          authorityBranch: "repopress/main/1234",
          publishBranchId: "publish_branch_1",
          commitSha: "authority-sha-1",
          githubSha: "blob-1",
          serverQueryToken: expect.any(String),
          publishedContentVersion: 3,
          expectedUpdatedAt: 5,
        }),
      ])
      // Still exactly one Git commit across both publishes.
      expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledTimes(1)
    })

    it("synchronizes byte-identical content against the base without creating a lane", async () => {
      const body = "# Already on main\n"
      mockPublishQueries({
        currentPublishBranch: null,
        dirtyDocs: [
          {
            _id: "doc_base",
            filePath: "posts/base.mdx",
            body,
            frontmatter: {},
            updatedAt: 5,
            contentVersion: 3,
          },
        ],
      })
      vi.mocked(getFileForPublish).mockResolvedValue({
        status: "found",
        file: { content: body, sha: "blob-base", name: "base.mdx", path: "content/posts/base.mdx" },
      } as never)
      const stampCalls: Array<Record<string, unknown>> = []
      convexMutationMock.mockImplementation(async (_fn, args) => {
        stampCalls.push(args as Record<string, unknown>)
        return { synchronized: true }
      })

      const response = await POST(buildRequest({ projectId: "project_123", publishMode: "create-new" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.synchronizedOnly).toBe(true)
      const baseStamps = stampCalls.filter((call) => call.id === "doc_base")
      expect(baseStamps).toEqual([
        expect.objectContaining({
          id: "doc_base",
          authorityKind: "base",
          authorityBranch: "main",
          commitSha: "authority-sha-1",
          serverQueryToken: expect.any(String),
        }),
      ])
      expect(baseStamps[0]).not.toHaveProperty("publishBranchId")
      expect(createPublishBranchFromSha).not.toHaveBeenCalled()
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("rechecks the zero-commit authority head and aborts on movement without stamping", async () => {
      const body = "# Same\n"
      mockPublishQueries({
        dirtyDocs: [{ _id: "doc_1", filePath: "same.mdx", body, frontmatter: {}, updatedAt: 5, contentVersion: 2 }],
      })
      vi.mocked(getFileForPublish).mockResolvedValue({
        status: "found",
        file: { content: body, sha: "blob-1", name: "same.mdx", path: "content/same.mdx" },
      } as never)
      vi.mocked(getBranchHeadForPublish)
        .mockResolvedValueOnce({ status: "found", sha: "authority-sha-1" } as never)
        .mockResolvedValueOnce({ status: "found", sha: "advanced-sha-2" } as never)

      const response = await POST(buildRequest({ projectId: "project_123" }))

      expect(response.status).toBe(409)
      expect(convexMutationMock.mock.calls.some(([, args]) => (args as Record<string, unknown>)?.id === "doc_1")).toBe(
        false,
      )
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("maps a typed final authority read failure to 502 without stamping", async () => {
      const body = "# Same\n"
      mockPublishQueries({
        dirtyDocs: [{ _id: "doc_1", filePath: "same.mdx", body, frontmatter: {}, updatedAt: 5, contentVersion: 2 }],
      })
      vi.mocked(getFileForPublish).mockResolvedValue({
        status: "found",
        file: { content: body, sha: "blob-1", name: "same.mdx", path: "content/same.mdx" },
      } as never)
      vi.mocked(getBranchHeadForPublish)
        .mockResolvedValueOnce({ status: "found", sha: "authority-sha-1" } as never)
        .mockRejectedValueOnce(new GitHubReadError("head unavailable"))

      const response = await POST(buildRequest({ projectId: "project_123" }))

      expect(response.status).toBe(502)
      expect(convexMutationMock.mock.calls.some(([, args]) => (args as Record<string, unknown>)?.id === "doc_1")).toBe(
        false,
      )
    })

    it("returns 409 when the zero-commit authority disappears before stamping", async () => {
      const body = "# Same\n"
      mockPublishQueries({
        dirtyDocs: [{ _id: "doc_1", filePath: "same.mdx", body, frontmatter: {}, updatedAt: 5, contentVersion: 2 }],
      })
      vi.mocked(getFileForPublish).mockResolvedValue({
        status: "found",
        file: { content: body, sha: "blob-1", name: "same.mdx", path: "content/same.mdx" },
      } as never)
      vi.mocked(getBranchHeadForPublish)
        .mockResolvedValueOnce({ status: "found", sha: "authority-sha-1" } as never)
        .mockResolvedValueOnce({ status: "absent" } as never)

      const response = await POST(buildRequest({ projectId: "project_123" }))

      expect(response.status).toBe(409)
      expect(convexMutationMock.mock.calls.some(([, args]) => (args as Record<string, unknown>)?.id === "doc_1")).toBe(
        false,
      )
    })

    it("counts rejected synchronization mutations and leaves them retryable", async () => {
      const body = "# Same\n"
      mockPublishQueries({
        dirtyDocs: [{ _id: "doc_1", filePath: "same.mdx", body, frontmatter: {}, updatedAt: 5, contentVersion: 2 }],
      })
      vi.mocked(getFileForPublish).mockResolvedValue({
        status: "found",
        file: { content: body, sha: "blob-1", name: "same.mdx", path: "content/same.mdx" },
      } as never)
      convexMutationMock.mockResolvedValue({ synchronized: false } as never)

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.warning).toMatch(/1 document\(s\) could not record/i)
      expect(payload.summary).toMatch(/^0 document\(s\) reconciled/)
    })

    it("keeps a partial zero-commit synchronization retryable without creating Git state", async () => {
      const body = "# Same\n"
      mockPublishQueries({
        currentPublishBranch: null,
        dirtyDocs: [
          { _id: "doc_a", filePath: "a.mdx", body, frontmatter: {}, updatedAt: 5, contentVersion: 2 },
          { _id: "doc_b", filePath: "b.mdx", body, frontmatter: {}, updatedAt: 6, contentVersion: 3 },
        ],
      })
      vi.mocked(getFileForPublish).mockImplementation(async (...args) => ({
        status: "found",
        file: { content: body, sha: `blob-${String(args[3])}`, name: "same.mdx", path: String(args[3]) },
      }))
      convexMutationMock.mockImplementation(async (_fn, args) => {
        const id = (args as Record<string, unknown>)?.id
        if (id === "doc_a") return { synchronized: true }
        if (id === "doc_b") throw new Error("transient mutation failure")
        return undefined
      })

      const first = await POST(buildRequest({ projectId: "project_123" }))
      const firstPayload = await first.json()

      expect(firstPayload.summary).toMatch(/^1 document\(s\) reconciled/)
      expect(firstPayload.warning).toMatch(/1 document\(s\) could not record/i)
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
      expect(createPublishBranchFromSha).not.toHaveBeenCalled()

      mockPublishQueries({
        currentPublishBranch: null,
        dirtyDocs: [{ _id: "doc_b", filePath: "b.mdx", body, frontmatter: {}, updatedAt: 6, contentVersion: 3 }],
      })
      const retriedIds: unknown[] = []
      convexMutationMock.mockImplementation(async (_fn, args) => {
        const id = (args as Record<string, unknown>)?.id
        if (id) retriedIds.push(id)
        return { synchronized: true }
      })

      const retry = await POST(buildRequest({ projectId: "project_123" }))

      expect(retry.status).toBe(200)
      expect(retriedIds).toEqual(["doc_b"])
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
      expect(createPublishBranchFromSha).not.toHaveBeenCalled()
    })

    it("keeps a redundant document out of a mixed media attempt and its cleanup ownership", async () => {
      const body = "# Already on lane\n"
      mockPublishQueries({
        dirtyDocs: [
          {
            _id: "doc_redundant",
            filePath: "posts/already.mdx",
            body,
            frontmatter: {},
            updatedAt: 5,
            contentVersion: 4,
            githubSha: "blob-existing",
          },
        ],
        pendingMediaOps: [
          {
            _id: "media_real",
            projectId: "project_123",
            repoPath: "/public/uploads/real.png",
            sourceType: "blob",
            blobUrl: "https://blob.example/real.png",
            updatedAt: 9,
          },
        ],
      })
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
      } as never)
      vi.mocked(getFileForPublish).mockImplementation(async (...callArgs: unknown[]) => {
        const path = String(callArgs[3])
        const ref = String(callArgs[4])
        if (ref === "authority-sha-1" && path === "content/posts/already.mdx") {
          return {
            status: "found",
            file: { content: body, sha: "blob-existing", name: "already.mdx", path },
          }
        }
        if (ref === "authority-sha-1" && path === "public/uploads/real.png") return { status: "absent" }
        return { status: "found", file: { content: "", sha: "synced-sha", name: "", path } }
      })
      const mutationCalls: Array<Record<string, unknown>> = []
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object") {
          const record = args as Record<string, unknown>
          mutationCalls.push(record)
          if ("planDigest" in record) return "attempt_1"
        }
        return undefined
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))

      expect(response.status).toBe(200)
      expect(mutationCalls).toContainEqual(
        expect.objectContaining({
          mediaAssociations: [
            expect.objectContaining({ mediaOpId: "media_real", repoPath: "public/uploads/real.png" }),
          ],
          documentAssociations: [],
        }),
      )
      expect(mutationCalls).not.toContainEqual(
        expect.objectContaining({ id: "doc_redundant", githubSha: expect.anything() }),
      )
      expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledWith(
        "gh-token",
        "acme",
        "docs-site",
        expect.anything(),
        [expect.objectContaining({ path: "public/uploads/real.png", action: "create" })],
        expect.any(String),
      )
    })

    it("does not adopt a commit that only mentions the digest outside an exact trailer line", async () => {
      mockPublishQueries({
        activePublishAttempt: committedAttempt({ status: "committing", commitSha: undefined }),
        attemptLane: recoveryLane,
      })
      vi.mocked(getBranchHeadForPublish).mockResolvedValue({ status: "found", sha: "prose-sha" } as never)
      vi.mocked(getCommitDetailsForPublish).mockResolvedValue({
        message: `mention of RepoPress-Publish-Attempt: ${PLAN_DIGEST} inside prose`,
        parents: ["authority-sha-1"],
      } as never)

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      // Not adopted; the walk reaches the expected head and proves
      // non-landing, so a fresh publish proceeds.
      expect(response.status).toBe(200)
      expect(payload.recovered).toBeUndefined()
      expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledTimes(1)
    })

    it("fails closed when the exact trailer sits on a commit that is not the direct child of the expected head", async () => {
      mockPublishQueries({
        activePublishAttempt: committedAttempt({ status: "committing", commitSha: undefined }),
        attemptLane: recoveryLane,
      })
      vi.mocked(getBranchHeadForPublish).mockResolvedValue({ status: "found", sha: "forged-sha" } as never)
      vi.mocked(getCommitDetailsForPublish).mockResolvedValue({
        message: `forged\n\nRepoPress-Publish-Attempt: ${PLAN_DIGEST}`,
        parents: ["some-other-parent"],
      } as never)

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(409)
      expect(payload.error).toMatch(/cannot prove/i)
      expect(convexMutationMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "attempt_1" }),
      )
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("replays partial multi-document reconciliation with the original associations - no false dirt", async () => {
      // First request: TWO dirty documents land in one commit; doc_a's SHA
      // refresh succeeds but doc_b's read fails, so the attempt stays
      // committed (retryable) with doc_a already synchronized.
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [
          { _id: "doc_a", filePath: "posts/a.mdx", body: "# A", frontmatter: {}, updatedAt: 100 },
          { _id: "doc_b", filePath: "posts/b.mdx", body: "# B", frontmatter: {}, updatedAt: 200 },
        ],
      })
      const snapshotCalls: Array<Record<string, unknown>> = []
      const attemptCalls: Array<Record<string, unknown>> = []
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object") {
          const record = args as Record<string, unknown>
          if ("planDigest" in record) return "attempt_1"
          if ("publishBranchId" in record && "githubSha" in record) snapshotCalls.push(record)
          if (record.id === "attempt_1") attemptCalls.push(record)
        }
        return undefined
      })
      vi.mocked(getFileForPublish).mockImplementation(async (...callArgs: unknown[]) => {
        const path = String(callArgs[3])
        const ref = String(callArgs[4])
        if (ref.startsWith("commit-sha")) {
          if (path.endsWith("/b.mdx")) throw new GitHubReadError("GitHub read failed (status: 500)")
          return { status: "found", file: { content: "", sha: "synced-sha", name: "", path } }
        }
        return { status: "absent" }
      })

      const first = await POST(buildRequest({ projectId: "project_123" }))
      const firstPayload = await first.json()

      expect(first.status).toBe(200)
      expect(firstPayload.reconciliationIncomplete).toBe(true)
      // Only doc_a was synchronized, with full lane/commit/revision
      // provenance and its ORIGINAL planned updatedAt.
      expect(snapshotCalls).toEqual([
        expect.objectContaining({
          id: "doc_a",
          publishBranchId: "publish_branch_1",
          commitSha: "commit-sha-1",
          expectedUpdatedAt: 100,
          contentRevision: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      ])
      // recordCommit happened; markReconciled (id-only) did not.
      expect(attemptCalls).toEqual([expect.objectContaining({ id: "attempt_1", commitSha: "commit-sha-1" })])

      // Retry: recovery replays BOTH associations verbatim from the durable
      // attempt. The doc_a replay patches identical provenance (a no-op for
      // its clean state) instead of treating it as concurrently edited.
      snapshotCalls.length = 0
      const retryAttemptCalls: Array<Record<string, unknown>> = []
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        activePublishAttempt: committedAttempt({
          documentAssociations: [
            {
              documentId: "doc_a",
              repoPath: "content/posts/a.mdx",
              expectedUpdatedAt: 100,
              contentRevision: "a".repeat(64),
            },
            {
              documentId: "doc_b",
              repoPath: "content/posts/b.mdx",
              expectedUpdatedAt: 200,
              contentRevision: "b".repeat(64),
            },
          ],
        }),
        attemptLane: recoveryLane,
      })
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object") {
          const record = args as Record<string, unknown>
          if ("publishBranchId" in record && "githubSha" in record) snapshotCalls.push(record)
          if (record.id === "attempt_1") retryAttemptCalls.push(record)
        }
        return undefined
      })
      vi.mocked(getFileForPublish).mockImplementation(async (...callArgs: unknown[]) => {
        const path = String(callArgs[3])
        return { status: "found", file: { content: "", sha: "synced-sha", name: "", path } }
      })

      const retry = await POST(buildRequest({ projectId: "project_123" }))
      const retryPayload = await retry.json()

      expect(retry.status).toBe(200)
      expect(retryPayload.recovered).toBe(true)
      expect(retryPayload.reconciliationIncomplete).toBeUndefined()
      expect(snapshotCalls).toEqual([
        expect.objectContaining({ id: "doc_a", expectedUpdatedAt: 100, contentRevision: "a".repeat(64) }),
        expect.objectContaining({ id: "doc_b", expectedUpdatedAt: 200, contentRevision: "b".repeat(64) }),
      ])
      // Reconciled after the replay; still exactly one Git commit overall.
      expect(retryAttemptCalls).toEqual([expect.objectContaining({ id: "attempt_1" })])
      expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledTimes(1)
    })

    it("retries after a crash between the SHA refresh and markReconciled as a pure replay", async () => {
      // Every document already refreshed once; the crash hit just before
      // markReconciled. The retry replays the same associations (no-ops for
      // the already-clean documents) and closes out the attempt.
      const snapshotCalls: Array<Record<string, unknown>> = []
      const attemptCalls: Array<Record<string, unknown>> = []
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        activePublishAttempt: committedAttempt({
          documentAssociations: [
            {
              documentId: "doc_a",
              repoPath: "content/posts/a.mdx",
              expectedUpdatedAt: 100,
              contentRevision: "a".repeat(64),
            },
          ],
        }),
        attemptLane: recoveryLane,
      })
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object") {
          const record = args as Record<string, unknown>
          if ("publishBranchId" in record && "githubSha" in record) snapshotCalls.push(record)
          if (record.id === "attempt_1") attemptCalls.push(record)
        }
        return undefined
      })
      vi.mocked(getFileForPublish).mockImplementation(async (...callArgs: unknown[]) => {
        const path = String(callArgs[3])
        return { status: "found", file: { content: "", sha: "synced-sha", name: "", path } }
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.recovered).toBe(true)
      expect(snapshotCalls).toEqual([
        expect.objectContaining({
          id: "doc_a",
          publishBranchId: "publish_branch_1",
          commitSha: "commit-sha-1",
          expectedUpdatedAt: 100,
          contentRevision: "a".repeat(64),
        }),
      ])
      expect(attemptCalls).toEqual([expect.objectContaining({ id: "attempt_1" })])
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("supersedes a still-pending committing attempt on a closed lane and publishes it fresh", async () => {
      // The lane's PR was closed unmerged while an attempt sat at the
      // commit boundary (its branch may already be deleted). recordCommit
      // never ran, so nothing was marked committed - superseding loses
      // nothing; its exact pending associations remain available for the
      // fresh publish without any lane-wide invalidation.
      convexQueryMock.mockReset()
      convexQueryMock
        .mockResolvedValueOnce(baseProject)
        .mockResolvedValueOnce([]) // pending ops (stale: before restore)
        .mockResolvedValueOnce([]) // dirty docs (stale: before restore)
        .mockResolvedValueOnce([]) // media ops
        .mockResolvedValueOnce(committedAttempt({ status: "committing", commitSha: undefined }))
        .mockResolvedValueOnce({ ...recoveryLane, status: "closed" })
        // Refetch after the invalidation restored the lane's content.
        .mockResolvedValueOnce([]) // pending ops
        .mockResolvedValueOnce([
          {
            _id: "doc_restored",
            filePath: "posts/restored.mdx",
            pathRepresentation: "content_relative_v1",
            body: "# Restored",
            frontmatter: {},
            updatedAt: 7,
          },
        ])
        .mockResolvedValueOnce([]) // media ops
        .mockResolvedValueOnce(null) // no current lane - the closed one is gone
        .mockResolvedValueOnce([]) // existing branch names
        .mockResolvedValueOnce({ _id: "publish_branch_2", branchName: "repopress/restored", projectId: "project_123" })
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object" && "planDigest" in (args as Record<string, unknown>)) {
          return "attempt_2"
        }
        return undefined
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.ok).toBe(true)
      expect(payload.recovered).toBeUndefined()
      // The old attempt was superseded without any lane-wide cleanup.
      expect(convexMutationMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "attempt_1" }))
      // The restored document publishes in this very request, to a new lane.
      expect(batchCommitPublishLaneAtExpectedHead).toHaveBeenCalledWith(
        "gh-token",
        "acme",
        "docs-site",
        expect.objectContaining({ branch: "repopress/restored", protectedBaseBranch: "main" }),
        expect.arrayContaining([expect.objectContaining({ path: "content/posts/restored.mdx" })]),
        expect.any(String),
      )
    })

    it("verifies a merged committing attempt from the immutable final tree without recording an original SHA", async () => {
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        activePublishAttempt: committedAttempt({ status: "committing", commitSha: undefined }),
        attemptLane: {
          ...recoveryLane,
          status: "merged",
          mergeCommitSha: "a".repeat(40),
          mergeVerificationState: "pending",
        },
      })
      vi.mocked(inspectPublishEffectsAtCommit).mockResolvedValue([
        { path: "content/posts/old.mdx", disposition: "finalize" },
      ])
      const attemptCalls: Array<Record<string, unknown>> = []
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object") {
          const record = args as Record<string, unknown>
          if (record.id === "attempt_1") attemptCalls.push(record)
        }
        return undefined
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.recovered).toBe(true)
      expect(payload.cleanupPending).toBe(true)
      expect(payload.mergeCommitSha).toBe("a".repeat(40))
      expect(inspectPublishEffectsAtCommit).toHaveBeenCalledWith(
        "gh-token",
        "acme",
        "docs-site",
        "a".repeat(40),
        expect.any(Array),
      )
      expect(getBranchHeadForPublish).not.toHaveBeenCalled()
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
      expect(attemptCalls).toEqual([
        expect.objectContaining({
          id: "attempt_1",
          authoritySha: "a".repeat(40),
          arbitrateMergedPaths: true,
          pathOutcomes: [{ path: "content/posts/old.mdx", disposition: "finalize" }],
        }),
      ])
      expect(attemptCalls[0]).not.toHaveProperty("commitSha")
    })

    it("restores a committing attempt excluded from the immutable merged tree", async () => {
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        activePublishAttempt: committedAttempt({ status: "committing", commitSha: undefined }),
        attemptLane: {
          ...recoveryLane,
          status: "merged",
          mergeCommitSha: "a".repeat(40),
          mergeVerificationState: "pending",
        },
      })
      vi.mocked(inspectPublishEffectsAtCommit).mockResolvedValue([
        { path: "content/posts/old.mdx", disposition: "restore", finalBlobSha: "f".repeat(40) },
      ])

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.ok).toBe(true)
      expect(payload.recovered).toBe(true)
      expect(payload.cleanupPending).toBe(true)
      expect(convexMutationMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: "attempt_1",
          pathOutcomes: [{ path: "content/posts/old.mdx", disposition: "restore" }],
        }),
      )
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("routes a committed merged attempt into durable attempt-scoped cleanup", async () => {
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        activePublishAttempt: committedAttempt(),
        attemptLane: {
          ...recoveryLane,
          status: "merged",
          mergeCommitSha: "a".repeat(40),
          mergeVerificationState: "pending",
        },
      })
      vi.mocked(inspectPublishEffectsAtCommit).mockResolvedValue([
        { path: "content/posts/old.mdx", disposition: "finalize" },
      ])

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.recovered).toBe(true)
      expect(payload.cleanupPending).toBe(true)
      expect(convexMutationMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "attempt_1", arbitrateMergedPaths: true }),
      )
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("restores a committed attempt when the final authority overwrote or deleted its path", async () => {
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        activePublishAttempt: committedAttempt(),
        attemptLane: {
          ...recoveryLane,
          status: "merged",
          mergeCommitSha: "a".repeat(40),
          mergeVerificationState: "pending",
        },
      })
      vi.mocked(inspectPublishEffectsAtCommit).mockResolvedValue([
        { path: "content/posts/old.mdx", disposition: "restore", finalBlobSha: "f".repeat(40) },
      ])

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.recovered).toBe(true)
      expect(payload.cleanupPending).toBe(true)
      expect(convexMutationMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: "attempt_1",
          pathOutcomes: [{ path: "content/posts/old.mdx", disposition: "restore" }],
        }),
      )
    })

    it("normalizes diagnostic final blobs when a later merge commit overwrote an attempted update", async () => {
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        activePublishAttempt: committedAttempt({
          operationDescriptors: [{ path: "content/posts/old.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        }),
        attemptLane: {
          ...recoveryLane,
          status: "merged",
          mergeCommitSha: "a".repeat(40),
          mergeVerificationState: "pending",
        },
      })
      vi.mocked(inspectPublishEffectsAtCommit).mockResolvedValue([
        { path: "content/posts/old.mdx", disposition: "restore", finalBlobSha: "c".repeat(40) },
      ])

      const response = await POST(buildRequest({ projectId: "project_123" }))

      expect(response.status).toBe(200)
      expect(convexMutationMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: "attempt_1",
          pathOutcomes: [{ path: "content/posts/old.mdx", disposition: "restore" }],
        }),
      )
    })

    it("fails closed when a merged lane has no immutable merge authority", async () => {
      mockPublishQueries({
        activePublishAttempt: committedAttempt({ status: "committing", commitSha: undefined }),
        attemptLane: { ...recoveryLane, status: "merged", prNumber: undefined },
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(409)
      expect(payload.error).toMatch(/immutable merge authority/i)
      expect(convexMutationMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "attempt_1" }),
      )
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })

    it("fails closed when the immutable merge tree read is truncated or unavailable", async () => {
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        activePublishAttempt: committedAttempt(),
        attemptLane: {
          ...recoveryLane,
          status: "merged",
          mergeCommitSha: "a".repeat(40),
          mergeVerificationState: "pending",
        },
      })
      vi.mocked(inspectPublishEffectsAtCommit).mockRejectedValue(
        new GitHubReadError("GitHub returned a truncated tree"),
      )

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(502)
      expect(payload.error).toMatch(/truncated tree/i)
      expect(convexMutationMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "attempt_1", arbitrateMergedPaths: true }),
      )
    })

    it("restores a committed attempt on a closed lane through durable attempt cleanup", async () => {
      const attemptCalls: Array<Record<string, unknown>> = []
      mockPublishQueries({
        pendingOps: [],
        dirtyDocs: [],
        activePublishAttempt: committedAttempt(),
        attemptLane: { ...recoveryLane, status: "closed", prNumber: undefined, prUrl: undefined },
      })
      convexMutationMock.mockImplementation(async (_fn: unknown, args: unknown) => {
        if (args && typeof args === "object") {
          const record = args as Record<string, unknown>
          if (record.id === "attempt_1") attemptCalls.push(record)
        }
        return undefined
      })

      const response = await POST(buildRequest({ projectId: "project_123" }))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.recovered).toBe(true)
      expect(payload.cleanupPending).toBe(true)
      expect(payload.warning).toMatch(/restor/i)
      expect(attemptCalls).toEqual([
        expect.objectContaining({
          id: "attempt_1",
          pathOutcomes: [{ path: "content/posts/old.mdx", disposition: "restore" }],
        }),
      ])
      // Never open a PR for a finished lane.
      expect(createPullRequest).not.toHaveBeenCalled()
      expect(batchCommitPublishLaneAtExpectedHead).not.toHaveBeenCalled()
    })
  })
})
