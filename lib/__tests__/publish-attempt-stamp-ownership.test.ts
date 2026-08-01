import { beforeEach, describe, expect, it, vi } from "vitest"

const { safeGetAuthUserMock } = vi.hoisted(() => ({ safeGetAuthUserMock: vi.fn() }))

vi.mock("@/convex/_generated/server", () => ({
  mutation: (definition: unknown) => definition,
  query: (definition: unknown) => definition,
  internalMutation: (definition: unknown) => definition,
  internalQuery: (definition: unknown) => definition,
  action: (definition: unknown) => definition,
}))

vi.mock("@/convex/auth", () => ({
  authComponent: { safeGetAuthUser: safeGetAuthUserMock },
}))

import { markPublishedSnapshot } from "@/convex/documents"
import { markCommitted as markExplorerCommitted } from "@/convex/explorerOps"
import { markCommitted as markMediaCommitted } from "@/convex/mediaOps"

const project = { _id: "project_1", userId: "user_owner", contentRoot: "content" }
const explorerOp = {
  _id: "op_1",
  projectId: "project_1",
  opType: "update",
  filePath: "a.mdx",
  pathRepresentation: "content_relative_v1",
  repoPath: "content/a.mdx",
  status: "pending",
  updatedAt: 10,
}
const mediaOp = {
  _id: "media_1",
  projectId: "project_1",
  repoPath: "public/a.png",
  status: "pending",
  updatedAt: 10,
}
const document = { _id: "doc_1", projectId: "project_1", filePath: "a.mdx", updatedAt: 10, contentVersion: 3 }
const attempt = {
  _id: "attempt_1",
  projectId: "project_1",
  publishBranchId: "lane_1",
  commitSha: "1".repeat(40),
  status: "committed",
  explorerAssociations: [{ opId: "op_1", repoPath: "content/a.mdx", expectedUpdatedAt: 10 }],
  mediaAssociations: [{ mediaOpId: "media_1", repoPath: "public/a.png", expectedUpdatedAt: 10 }],
  documentAssociations: [
    {
      documentId: "doc_1",
      repoPath: "content/a.mdx",
      expectedUpdatedAt: 10,
      contentRevision: "a".repeat(64),
      contentVersion: 3,
    },
  ],
}

function createCtx(rows: Array<Record<string, any>>) {
  const byId = new Map(rows.map((row) => [row._id, row]))
  return {
    db: {
      get: vi.fn(async (id: string) => byId.get(id) ?? null),
      patch: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      query: vi.fn(),
    },
  } as any
}

describe("publish attempt stamp ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue({ _id: "user_owner" })
  })

  it.each([
    ["lane", { publishBranchId: "lane_other" }, {}],
    ["commit", { commitSha: "2".repeat(40) }, {}],
    ["status", {}, { status: "committing" }],
    ["path", {}, { explorerAssociations: [{ opId: "op_1", repoPath: "content/other.mdx", expectedUpdatedAt: 10 }] }],
    ["snapshot", {}, { explorerAssociations: [{ opId: "op_1", repoPath: "content/a.mdx", expectedUpdatedAt: 9 }] }],
  ])("rejects explorer stamping when the persisted attempt %s does not match", async (_label, argsOverride, attemptOverride) => {
    const ctx = createCtx([project, explorerOp, { ...attempt, ...attemptOverride }])

    await expect(
      (markExplorerCommitted as any).handler(ctx, {
        ids: ["op_1"],
        publishAttemptId: "attempt_1",
        publishBranchId: "lane_1",
        commitSha: "1".repeat(40),
        userId: "user_owner",
        ...argsOverride,
      }),
    ).rejects.toThrow(/attempt ownership/i)
    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("rejects media stamping when the exact media association path does not match", async () => {
    const ctx = createCtx([
      project,
      mediaOp,
      {
        ...attempt,
        mediaAssociations: [{ mediaOpId: "media_1", repoPath: "public/other.png", expectedUpdatedAt: 10 }],
      },
    ])

    await expect(
      (markMediaCommitted as any).handler(ctx, {
        ids: ["media_1"],
        publishAttemptId: "attempt_1",
        publishBranchId: "lane_1",
        commitSha: "1".repeat(40),
        userId: "user_owner",
      }),
    ).rejects.toThrow(/attempt ownership/i)
    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("rejects document stamping when the persisted snapshot identity does not match", async () => {
    const ctx = createCtx([project, document, attempt])

    await expect(
      (markPublishedSnapshot as any).handler(ctx, {
        id: "doc_1",
        githubSha: "blob_1",
        authorityKind: "lane",
        authorityBranch: "repopress/start",
        publishAttemptId: "attempt_1",
        publishBranchId: "lane_1",
        commitSha: "1".repeat(40),
        repoPath: "content/a.mdx",
        contentRevision: "b".repeat(64),
        publishedContentVersion: 3,
        expectedUpdatedAt: 10,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/attempt ownership/i)
    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("keeps the pre-attempt legacy stamping path explicit", async () => {
    const ctx = createCtx([project, explorerOp])

    await (markExplorerCommitted as any).handler(ctx, {
      ids: ["op_1"],
      commitSha: "legacy_commit",
      userId: "user_owner",
    })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "op_1",
      expect.objectContaining({ status: "committed", commitSha: "legacy_commit", publishAttemptId: undefined }),
    )
  })
})
