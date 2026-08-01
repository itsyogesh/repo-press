import { beforeEach, describe, expect, it, vi } from "vitest"

const { safeGetAuthUserMock } = vi.hoisted(() => ({
  safeGetAuthUserMock: vi.fn(),
}))

vi.mock("@/convex/_generated/server", () => ({
  mutation: (definition: unknown) => definition,
  query: (definition: unknown) => definition,
  internalMutation: (definition: unknown) => definition,
  internalQuery: (definition: unknown) => definition,
  action: (definition: unknown) => definition,
}))

vi.mock("@/convex/auth", () => ({
  authComponent: {
    safeGetAuthUser: safeGetAuthUserMock,
  },
}))

import { restoreVersion as restoreDocumentHistoryVersion } from "@/convex/documentHistory"
import { getOrCreateInternal, remove as removeDocument, saveDraft, transitionStatus } from "@/convex/documents"
import { markCommitted as markExplorerOpsCommitted, stageDelete } from "@/convex/explorerOps"
import { stage as stageMediaOp } from "@/convex/mediaOps"
import { removeFull, remove as removeProject, update as updateProject } from "@/convex/projects"
import {
  create as createPublishBranch,
  markClosed as markPublishBranchClosed,
  markMerged as markPublishBranchMerged,
  updateAfterCommit as updatePublishBranchAfterCommit,
} from "@/convex/publishBranches"
import { mintProjectAccessToken } from "@/lib/project-access-token"

function createCtx(overrides?: {
  get?: ReturnType<typeof vi.fn>
  patch?: ReturnType<typeof vi.fn>
  insert?: ReturnType<typeof vi.fn>
  delete?: ReturnType<typeof vi.fn>
  queryResult?: any
}) {
  const queryResult = overrides?.queryResult ?? null
  return {
    db: {
      get: overrides?.get ?? vi.fn(),
      patch: overrides?.patch ?? vi.fn(),
      insert: overrides?.insert ?? vi.fn(),
      delete: overrides?.delete ?? vi.fn(),
      query: vi.fn(() => ({
        withIndex: () => ({
          first: vi.fn().mockResolvedValue(queryResult),
          filter: () => ({
            first: vi.fn().mockResolvedValue(queryResult),
          }),
        }),
      })),
    },
    scheduler: {
      runAfter: vi.fn(),
    },
  } as any
}

describe("Convex ownership guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    safeGetAuthUserMock.mockResolvedValue({ _id: "user_owner" })
  })

  it("rejects project updates when the caller does not own the project", async () => {
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue({ _id: "project_1", userId: "user_other", repoOwner: "acme", repoName: "docs" }),
      patch: vi.fn(),
    })

    await expect(
      (updateProject as any).handler(ctx, {
        id: "project_1",
        userId: "user_owner",
        name: "Renamed project",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("rejects project deletes when the authenticated user does not own the project", async () => {
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue({ _id: "project_1", userId: "user_other", repoOwner: "acme", repoName: "docs" }),
      delete: vi.fn(),
    })

    await expect(
      (removeProject as any).handler(ctx, {
        id: "project_1",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.db.delete).not.toHaveBeenCalled()
  })

  it("rejects document deletes when the caller does not own the backing project", async () => {
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({ _id: "doc_1", projectId: "project_1" })
        .mockResolvedValueOnce({ _id: "project_1", userId: "user_other", repoOwner: "acme", repoName: "docs" }),
      delete: vi.fn(),
    })

    await expect(
      (removeDocument as any).handler(ctx, {
        id: "doc_1",
        userId: "user_owner",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.db.delete).not.toHaveBeenCalled()
  })

  it("rejects publish branch creation when the caller does not own the project", async () => {
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue({ _id: "project_1", userId: "user_other", repoOwner: "acme", repoName: "docs" }),
      insert: vi.fn(),
    })

    await expect(
      (createPublishBranch as any).handler(ctx, {
        projectId: "project_1",
        userId: "user_owner",
        branchName: "repopress/main/123",
        baseBranch: "main",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.db.insert).not.toHaveBeenCalled()
  })

  it("rejects publish branch updates when the caller does not own the backing project", async () => {
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "branch_1",
          projectId: "project_1",
          committedFilePaths: ["docs/a.mdx"],
        })
        .mockResolvedValueOnce({ _id: "project_1", userId: "user_other", repoOwner: "acme", repoName: "docs" }),
      patch: vi.fn(),
    })

    await expect(
      (updatePublishBranchAfterCommit as any).handler(ctx, {
        id: "branch_1",
        userId: "user_owner",
        lastCommitSha: "abc123",
        newFilePaths: ["docs/b.mdx"],
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("rejects publish branch merge state changes when the caller does not own the backing project", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ _id: "branch_1", projectId: "project_1" })
      .mockResolvedValueOnce({ _id: "project_1", userId: "user_other", repoOwner: "acme", repoName: "docs" })
    const patch = vi.fn()
    const ctx = createCtx({ get, patch })

    await expect(
      (markPublishBranchMerged as any).handler(ctx, {
        id: "branch_1",
        userId: "user_owner",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("rejects publish branch close state changes when the caller does not own the backing project", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ _id: "branch_1", projectId: "project_1" })
      .mockResolvedValueOnce({ _id: "project_1", userId: "user_other", repoOwner: "acme", repoName: "docs" })
    const patch = vi.fn()
    const ctx = createCtx({ get, patch })

    await expect(
      (markPublishBranchClosed as any).handler(ctx, {
        id: "branch_1",
        userId: "user_owner",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("allows saveDraft when PAT mode supplies a valid project access token", async () => {
    safeGetAuthUserMock.mockResolvedValue(null)
    const projectAccessToken = await mintProjectAccessToken({
      projectId: "project_1",
      userId: "user_owner",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
    })
    const patch = vi.fn()
    const insert = vi.fn()
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "doc_1",
          projectId: "project_1",
          status: "draft",
          body: "# Old body",
          frontmatter: { title: "Old" },
          updatedAt: 1,
        })
        .mockResolvedValueOnce({ _id: "project_1", userId: "user_owner" }),
      patch,
      insert,
    })

    await (saveDraft as any).handler(ctx, {
      id: "doc_1",
      body: "# New body",
      frontmatter: { title: "New" },
      projectAccessToken,
    })

    expect(insert).toHaveBeenCalled()
    expect(patch).toHaveBeenCalled()
  })

  it("allows media staging when PAT mode supplies a valid project access token", async () => {
    safeGetAuthUserMock.mockResolvedValue(null)
    const projectAccessToken = await mintProjectAccessToken({
      projectId: "project_1",
      userId: "user_owner",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
    })
    const insert = vi.fn().mockResolvedValue("media_op_1")
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue({ _id: "project_1", userId: "user_owner" }),
      insert,
    })
    ctx.db.query = vi.fn(() => ({
      withIndex: () => ({
        filter: () => ({
          first: vi.fn().mockResolvedValue(null),
        }),
      }),
    }))

    await (stageMediaOp as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      projectAccessToken,
      repoPath: "/public/images/hero.png",
      fileName: "hero.png",
      mimeType: "image/png",
      sourceType: "blob",
      blobUrl: "https://blob.example/hero.png",
    })

    expect(insert).toHaveBeenCalled()
  })

  it("allows explorer op commit marking when PAT mode supplies a valid project access token", async () => {
    safeGetAuthUserMock.mockResolvedValue(null)
    const projectAccessToken = await mintProjectAccessToken({
      projectId: "project_1",
      userId: "user_owner",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
    })
    const patch = vi.fn()
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "op_1",
          projectId: "project_1",
          status: "pending",
        })
        .mockResolvedValueOnce({ _id: "project_1", userId: "user_owner" }),
      patch,
    })

    await (markExplorerOpsCommitted as any).handler(ctx, {
      ids: ["op_1"],
      commitSha: "commit_1",
      userId: "user_owner",
      projectAccessToken,
    })

    expect(patch).toHaveBeenCalledWith(
      "op_1",
      expect.objectContaining({
        status: "committed",
        commitSha: "commit_1",
      }),
    )
  })

  it.each([
    ["canonical", "guides/start.mdx", "content_relative_v1", "guides/start.mdx", "content_relative_v1"],
    ["legacy", "content/docs/guides/start.mdx", undefined, "content/docs/guides/start.mdx", undefined],
    [
      "canonical operation for a legacy document",
      "guides/start.mdx",
      "content_relative_v1",
      "content/docs/guides/start.mdx",
      undefined,
    ],
    [
      "NFC canonical operation for an NFD legacy document",
      "guides/café.mdx",
      "content_relative_v1",
      "content/docs/guides/cafe\u0301.mdx",
      undefined,
    ],
  ])("preserves the associated %s dirty document until merge verification", async (_label, opFilePath, opPathRepresentation, docFilePath, docPathRepresentation) => {
    const patch = vi.fn()
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "op_delete",
          projectId: "project_1",
          opType: "delete",
          filePath: opFilePath,
          pathRepresentation: opPathRepresentation,
          status: "pending",
        })
        .mockResolvedValueOnce({ _id: "project_1", userId: "user_owner", contentRoot: "content/docs" })
        .mockResolvedValueOnce({
          _id: "doc_dirty",
          projectId: "project_1",
          filePath: docFilePath,
          pathRepresentation: docPathRepresentation,
          status: "draft",
          body: "# Dirty",
          frontmatter: { title: "Dirty" },
          updatedAt: 100,
        }),
      patch,
      queryResult: null,
    })

    await (markExplorerOpsCommitted as any).handler(ctx, {
      ids: ["op_delete"],
      deleteAssociations: [{ opId: "op_delete", documentId: "doc_dirty", expectedUpdatedAt: 100 }],
      commitSha: "commit_1",
      userId: "user_owner",
    })

    expect(patch).not.toHaveBeenCalledWith("doc_dirty", expect.anything())
    expect(patch).toHaveBeenCalledWith("op_delete", expect.objectContaining({ status: "committed" }))
  })

  it("preserves a concurrently saved draft while still recording the committed delete operation", async () => {
    // markCommitted runs after the GitHub commit has landed, so a concurrent
    // edit must not throw (that would leave the op "pending" against a real
    // commit and make retries re-commit it). The draft clear is skipped and
    // reported instead; the op status records reality.
    const patch = vi.fn()
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "op_delete",
          projectId: "project_1",
          opType: "delete",
          filePath: "guides/start.mdx",
          pathRepresentation: "content_relative_v1",
          status: "pending",
        })
        .mockResolvedValueOnce({ _id: "project_1", userId: "user_owner", contentRoot: "content/docs" })
        .mockResolvedValueOnce({
          _id: "doc_dirty",
          projectId: "project_1",
          filePath: "guides/start.mdx",
          pathRepresentation: "content_relative_v1",
          updatedAt: 101,
        }),
      patch,
    })

    const result = await (markExplorerOpsCommitted as any).handler(ctx, {
      ids: ["op_delete"],
      deleteAssociations: [{ opId: "op_delete", documentId: "doc_dirty", expectedUpdatedAt: 100 }],
      commitSha: "commit_1",
      userId: "user_owner",
    })

    expect(patch).not.toHaveBeenCalledWith("doc_dirty", expect.anything())
    expect(patch).toHaveBeenCalledWith("op_delete", expect.objectContaining({ status: "committed" }))
    expect(result).toEqual({
      skippedDeleteAssociations: [
        expect.objectContaining({
          opId: "op_delete",
          documentId: "doc_dirty",
          reason: "document-changed-after-snapshot",
        }),
      ],
      unreconciledOpIds: [],
    })
  })

  it("allows history restore when PAT mode supplies a valid project access token", async () => {
    safeGetAuthUserMock.mockResolvedValue(null)
    const projectAccessToken = await mintProjectAccessToken({
      projectId: "project_1",
      userId: "user_owner",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
    })
    const insert = vi.fn()
    const patch = vi.fn()
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "history_1",
          documentId: "doc_1",
          body: "# Old version",
          frontmatter: { title: "Old" },
          createdAt: 100,
        })
        .mockResolvedValueOnce({
          _id: "doc_1",
          projectId: "project_1",
          body: "# Current version",
          frontmatter: { title: "Current" },
          status: "draft",
        })
        .mockResolvedValueOnce({ _id: "project_1", userId: "user_owner" }),
      insert,
      patch,
    })

    await (restoreDocumentHistoryVersion as any).handler(ctx, {
      historyId: "history_1",
      projectAccessToken,
    })

    expect(insert).toHaveBeenCalled()
    expect(patch).toHaveBeenCalled()
  })

  it("keeps internal document creation idempotent for repeated sync passes", async () => {
    const insert = vi.fn()
    const ctx = createCtx({
      get: vi.fn(),
      insert,
    })
    ctx.db.query = vi.fn(() => ({
      withIndex: () => ({
        first: vi.fn().mockResolvedValue({
          _id: "doc_existing",
          projectId: "project_1",
          filePath: "posts/hello.mdx",
          pathRepresentation: "content_relative_v1",
        }),
        filter: () => ({
          first: vi.fn().mockResolvedValue({
            _id: "doc_existing",
            projectId: "project_1",
            filePath: "posts/hello.mdx",
            pathRepresentation: "content_relative_v1",
          }),
        }),
      }),
    }))

    const result = await (getOrCreateInternal as any).handler(ctx, {
      projectId: "project_1",
      filePath: "posts/hello.mdx",
      pathRepresentation: "content_relative_v1",
      title: "Hello",
      githubSha: "sha_1",
    })

    expect(result).toBe("doc_existing")
    expect(insert).not.toHaveBeenCalled()
  })

  it("tags newly synchronized documents as content-relative", async () => {
    const insert = vi.fn().mockResolvedValue("doc_new")
    const ctx = createCtx({ insert, queryResult: null })

    await (getOrCreateInternal as any).handler(ctx, {
      projectId: "project_1",
      filePath: "posts/hello.mdx",
      pathRepresentation: "content_relative_v1",
      title: "Hello",
      githubSha: "sha_1",
    })

    expect(insert).toHaveBeenCalledWith(
      "documents",
      expect.objectContaining({ filePath: "posts/hello.mdx", pathRepresentation: "content_relative_v1" }),
    )
  })

  it("tags newly staged explorer operations as content-relative", async () => {
    const insert = vi.fn().mockResolvedValue("op_new")
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue({
        _id: "project_1",
        userId: "user_owner",
        repoOwner: "acme",
        repoName: "docs-site",
        branch: "main",
      }),
      insert,
      queryResult: null,
    })

    await (stageDelete as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      filePath: "posts/hello.mdx",
      pathRepresentation: "content_relative_v1",
    })

    expect(insert).toHaveBeenCalledWith(
      "explorerOps",
      expect.objectContaining({ filePath: "posts/hello.mdx", pathRepresentation: "content_relative_v1" }),
    )
  })

  it("allows PAT-driven status transition with a valid project access token", async () => {
    safeGetAuthUserMock.mockResolvedValue(null)
    const projectAccessToken = await mintProjectAccessToken({
      projectId: "project_1",
      userId: "user_owner",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
      role: "editor",
    })
    const patch = vi.fn()
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "doc_1",
          projectId: "project_1",
          status: "draft",
        })
        .mockResolvedValueOnce({ _id: "project_1", userId: "user_owner" }),
      patch,
    })

    await (transitionStatus as any).handler(ctx, {
      id: "doc_1",
      projectAccessToken,
      newStatus: "in_review",
    })

    expect(patch).toHaveBeenCalledWith("doc_1", expect.objectContaining({ status: "in_review" }))
  })

  it("rejects PAT-driven status transition without any auth", async () => {
    safeGetAuthUserMock.mockResolvedValue(null)
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "doc_1",
          projectId: "project_1",
          status: "draft",
        })
        .mockResolvedValueOnce({ _id: "project_1", userId: "user_owner" }),
      patch: vi.fn(),
    })

    await expect(
      (transitionStatus as any).handler(ctx, {
        id: "doc_1",
        newStatus: "in_review",
      }),
    ).rejects.toThrow("Unauthorized")
  })

  it("allows PAT-driven project deletion with owner role token", async () => {
    safeGetAuthUserMock.mockResolvedValue(null)
    const projectAccessToken = await mintProjectAccessToken({
      projectId: "project_1",
      userId: "user_owner",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
      role: "owner",
    })
    const patch = vi.fn()
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue({
        _id: "project_1",
        userId: "user_owner",
        name: "My Project",
        repoOwner: "acme",
        repoName: "docs-site",
      }),
      patch,
    })

    await (removeFull as any).handler(ctx, {
      projectId: "project_1",
      projectAccessToken,
    })

    expect(patch).toHaveBeenCalledWith(
      "project_1",
      expect.objectContaining({ name: expect.stringContaining("[DELETING]") }),
    )
    expect(ctx.scheduler.runAfter).toHaveBeenCalled()
  })

  it("rejects PAT-driven project deletion with editor role token", async () => {
    safeGetAuthUserMock.mockResolvedValue(null)
    const projectAccessToken = await mintProjectAccessToken({
      projectId: "project_1",
      userId: "user_editor",
      repoOwner: "acme",
      repoName: "docs-site",
      branch: "main",
      role: "editor",
    })
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue({
        _id: "project_1",
        userId: "user_owner",
        name: "My Project",
        repoOwner: "acme",
        repoName: "docs-site",
      }),
      patch: vi.fn(),
    })

    await expect(
      (removeFull as any).handler(ctx, {
        projectId: "project_1",
        projectAccessToken,
      }),
    ).rejects.toThrow(/permissions/)
  })
})
