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

import { markCommitted } from "@/convex/explorerOps"
import { mintProjectAccessToken } from "@/lib/project-access-token"

function createCtx(get: ReturnType<typeof vi.fn>, patch: ReturnType<typeof vi.fn>) {
  return {
    db: {
      get,
      patch,
      insert: vi.fn(),
      delete: vi.fn(),
      query: vi.fn(() => ({
        withIndex: () => ({
          first: vi.fn().mockResolvedValue(null),
          filter: () => ({ first: vi.fn().mockResolvedValue(null) }),
        }),
      })),
    },
    scheduler: { runAfter: vi.fn() },
  } as any
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
    expect(result).toEqual({ skippedDeleteAssociations: [] })
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
    expect(result).toEqual({ skippedDeleteAssociations: [] })
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
    })
  })
})
