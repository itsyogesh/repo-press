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

import { discardAll, markCommitted, undoOp } from "@/convex/explorerOps"
import { stage as stageMedia, undoByRepoPath as undoMediaByRepoPath } from "@/convex/mediaOps"
import { mintProjectAccessToken } from "@/lib/project-access-token"

function createCtx(
  get: ReturnType<typeof vi.fn>,
  patch: ReturnType<typeof vi.fn>,
  options?: {
    activePublishAttempt?: Record<string, unknown> | null
    pendingMediaRow?: Record<string, unknown> | null
  },
) {
  const activePublishAttempt = options?.activePublishAttempt ?? null
  const pendingMediaRow = options?.pendingMediaRow ?? null
  const emptyChain = (): any => ({
    first: vi.fn().mockResolvedValue(null),
    collect: vi.fn().mockResolvedValue([]),
    filter: () => emptyChain(),
  })
  return {
    db: {
      get,
      patch,
      insert: vi.fn(),
      delete: vi.fn(),
      query: vi.fn((table: string) => ({
        withIndex: () => ({
          first: vi.fn().mockResolvedValue(table === "publishAttempts" ? activePublishAttempt : null),
          collect: vi.fn().mockResolvedValue([]),
          filter: () =>
            table === "mediaOps" && pendingMediaRow
              ? {
                  first: vi.fn().mockResolvedValue(pendingMediaRow),
                  collect: vi.fn().mockResolvedValue([]),
                  filter: () => emptyChain(),
                }
              : emptyChain(),
        }),
      })),
    },
    scheduler: { runAfter: vi.fn() },
    storage: { delete: vi.fn() },
  } as any
}

const activeAttempt = {
  _id: "attempt_1",
  projectId: "project_1",
  branchName: "repopress/start",
  planDigest: "digest-1",
  status: "committing",
}

async function patToken() {
  return mintProjectAccessToken({
    projectId: "project_1",
    userId: "user_owner",
    repoOwner: "acme",
    repoName: "docs-site",
    branch: "main",
  })
}

const pendingDeleteOp = {
  _id: "op_delete",
  projectId: "project_1",
  opType: "delete",
  filePath: "guides/start.mdx",
  pathRepresentation: "content_relative_v1",
  status: "pending",
}

const project = { _id: "project_1", userId: "user_owner", contentRoot: "content" }

describe("markCommitted post-commit reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    safeGetAuthUserMock.mockResolvedValue(null)
  })

  it("skips the document clear (not the whole batch) when the associated document changed after the snapshot", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(pendingDeleteOp).mockResolvedValueOnce(project).mockResolvedValueOnce({
      _id: "doc_1",
      projectId: "project_1",
      filePath: "guides/start.mdx",
      pathRepresentation: "content_relative_v1",
      updatedAt: 2_000, // concurrent save bumped it past the snapshot
    })

    const result = await (markCommitted as any).handler(createCtx(get, patch), {
      ids: ["op_delete"],
      deleteAssociations: [{ opId: "op_delete", documentId: "doc_1", expectedUpdatedAt: 1_000 }],
      commitSha: "commit_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    // The op is still recorded as committed - GitHub already has the commit.
    expect(patch).toHaveBeenCalledWith(
      "op_delete",
      expect.objectContaining({ status: "committed", commitSha: "commit_1" }),
    )
    // The document body/frontmatter must NOT be cleared - the concurrent edit survives.
    expect(patch).not.toHaveBeenCalledWith("doc_1", expect.anything())
    expect(result).toEqual({
      skippedDeleteAssociations: [
        expect.objectContaining({
          opId: "op_delete",
          documentId: "doc_1",
          reason: "document-changed-after-snapshot",
        }),
      ],
      unreconciledOpIds: [],
    })
  })

  it("clears the associated document when the snapshot still matches", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(pendingDeleteOp).mockResolvedValueOnce(project).mockResolvedValueOnce({
      _id: "doc_1",
      projectId: "project_1",
      filePath: "guides/start.mdx",
      pathRepresentation: "content_relative_v1",
      updatedAt: 1_000,
    })

    const result = await (markCommitted as any).handler(createCtx(get, patch), {
      ids: ["op_delete"],
      deleteAssociations: [{ opId: "op_delete", documentId: "doc_1", expectedUpdatedAt: 1_000 }],
      commitSha: "commit_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(patch).toHaveBeenCalledWith("doc_1", expect.objectContaining({ body: undefined, frontmatter: undefined }))
    expect(patch).toHaveBeenCalledWith("op_delete", expect.objectContaining({ status: "committed" }))
    expect(result).toEqual({ skippedDeleteAssociations: [], unreconciledOpIds: [] })
  })

  it("is idempotent for retries: already-committed ops are untouched and produce no errors", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce({ ...pendingDeleteOp, status: "committed" })

    const result = await (markCommitted as any).handler(createCtx(get, patch), {
      ids: ["op_delete"],
      deleteAssociations: [{ opId: "op_delete", documentId: "doc_1", expectedUpdatedAt: 1_000 }],
      commitSha: "commit_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(patch).not.toHaveBeenCalled()
    expect(result).toEqual({ skippedDeleteAssociations: [], unreconciledOpIds: [] })
  })

  it("reports concurrently undone ops as unreconciled instead of silently absorbing them", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce({ ...pendingDeleteOp, status: "undone" })

    const result = await (markCommitted as any).handler(createCtx(get, patch), {
      ids: ["op_delete"],
      commitSha: "commit_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(patch).not.toHaveBeenCalled()
    expect(result).toEqual({ skippedDeleteAssociations: [], unreconciledOpIds: ["op_delete"] })
  })

  it("skips a cross-project association with an integrity reason while still committing the op", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(pendingDeleteOp).mockResolvedValueOnce(project).mockResolvedValueOnce({
      _id: "doc_other",
      projectId: "project_OTHER",
      filePath: "guides/start.mdx",
      pathRepresentation: "content_relative_v1",
      updatedAt: 1_000,
    })

    const result = await (markCommitted as any).handler(createCtx(get, patch), {
      ids: ["op_delete"],
      deleteAssociations: [{ opId: "op_delete", documentId: "doc_other", expectedUpdatedAt: 1_000 }],
      commitSha: "commit_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(patch).not.toHaveBeenCalledWith("doc_other", expect.anything())
    expect(patch).toHaveBeenCalledWith("op_delete", expect.objectContaining({ status: "committed" }))
    expect(result).toEqual({
      skippedDeleteAssociations: [
        expect.objectContaining({ opId: "op_delete", reason: "association-project-mismatch" }),
      ],
      unreconciledOpIds: [],
    })
  })
})

describe("publish attempt guard on undo/discard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    safeGetAuthUserMock.mockResolvedValue(null)
  })

  it("refuses undoOp while a publish attempt is at the commit boundary", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(pendingDeleteOp).mockResolvedValueOnce(project)

    await expect(
      (undoOp as any).handler(createCtx(get, patch, { activePublishAttempt: activeAttempt }), {
        id: "op_delete",
        userId: "user_owner",
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/publish is in progress/i)

    expect(patch).not.toHaveBeenCalled()
  })

  it("allows undoOp when no publish attempt is active", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(pendingDeleteOp).mockResolvedValueOnce(project)

    await (undoOp as any).handler(createCtx(get, patch), {
      id: "op_delete",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(patch).toHaveBeenCalledWith("op_delete", expect.objectContaining({ status: "undone" }))
  })

  it("refuses discardAll while a publish attempt is at the commit boundary", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(project)

    await expect(
      (discardAll as any).handler(createCtx(get, patch, { activePublishAttempt: activeAttempt }), {
        projectId: "project_1",
        userId: "user_owner",
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/publish is in progress/i)

    expect(patch).not.toHaveBeenCalled()
  })

  it("refuses individual media undo while a publish attempt is at the commit boundary", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(project)

    await expect(
      (undoMediaByRepoPath as any).handler(createCtx(get, patch, { activePublishAttempt: activeAttempt }), {
        projectId: "project_1",
        repoPath: "/public/uploads/pic.png",
        userId: "user_owner",
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/publish is in progress/i)

    expect(patch).not.toHaveBeenCalled()
  })

  it("allows individual media undo when no publish attempt is active", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(project)

    const result = await (undoMediaByRepoPath as any).handler(createCtx(get, patch), {
      projectId: "project_1",
      repoPath: "/public/uploads/pic.png",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    // No pending op in the mocked table; the guard let the call through.
    expect(result).toBeNull()
    expect(patch).not.toHaveBeenCalled()
  })

  it("rejects replacing a pending media upload while a publish attempt is active and deletes the new bytes", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(project)
    const ctx = createCtx(get, patch, {
      activePublishAttempt: activeAttempt,
      pendingMediaRow: { _id: "media_1", projectId: "project_1", convexStorageId: "storage_old" },
    })

    const result = await (stageMedia as any).handler(ctx, {
      projectId: "project_1",
      repoPath: "/public/uploads/pic.png",
      fileName: "pic.png",
      mimeType: "image/png",
      sourceType: "convex",
      convexStorageId: "storage_new",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    // Structured refusal, NOT a throw: the mutation must commit for the
    // storage delete to take effect (a thrown mutation rolls it back and
    // orphans the just-uploaded object). The route maps this to a 409.
    expect(result).toEqual({ staged: false, reason: "publish-in-progress" })
    // The rejected NEW upload was deleted; the planned row and its bytes
    // were untouched, and no tombstone was needed.
    expect(ctx.storage.delete).toHaveBeenCalledWith("storage_new")
    expect(ctx.storage.delete).not.toHaveBeenCalledWith("storage_old")
    expect(ctx.db.insert).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
  })

  it("leaves a durable failed tombstone owning the rejected bytes when the storage delete fails", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(project)
    const ctx = createCtx(get, patch, {
      activePublishAttempt: activeAttempt,
      pendingMediaRow: { _id: "media_1", projectId: "project_1", convexStorageId: "storage_old" },
    })
    ctx.storage.delete.mockRejectedValue(new Error("storage backend unavailable"))

    const result = await (stageMedia as any).handler(ctx, {
      projectId: "project_1",
      repoPath: "/public/uploads/pic.png",
      fileName: "pic.png",
      mimeType: "image/png",
      sourceType: "convex",
      convexStorageId: "storage_new",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    // Still a truthful 409-shaped refusal - but the unowned object now has
    // a "failed" tombstone row so the nightly cron can retry the delete.
    expect(result).toEqual({ staged: false, reason: "publish-in-progress" })
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "mediaOps",
      expect.objectContaining({ status: "failed", convexStorageId: "storage_new" }),
    )
  })

  it("allows discardAll when no publish attempt is active", async () => {
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(project)

    const result = await (discardAll as any).handler(createCtx(get, patch), {
      projectId: "project_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(result).toEqual(
      expect.objectContaining({ discardedOpIds: [], discardedMediaOpIds: [], discardedDirtyDocIds: [] }),
    )
  })
})
