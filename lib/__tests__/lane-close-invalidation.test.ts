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

import { handlePRClosed } from "@/convex/githubWebhook"
import { invalidateClosedLaneSync } from "@/convex/lib/laneInvalidation"
import { cleanupStaleUploads } from "@/convex/mediaOps"
import { finishLaneInvalidation, markClosed } from "@/convex/publishBranches"
import { mintProjectAccessToken, mintServerQueryToken } from "@/lib/project-access-token"

const project = { _id: "project_1", userId: "user_owner", contentRoot: "content" }

function laneDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: "lane_1",
    projectId: "project_1",
    branchName: "repopress/start",
    baseBranch: "main",
    status: "closed",
    prNumber: 42,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
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

/**
 * Table/status-aware db mock: withIndex callbacks run against a recorder so
 * eq("status", ...) and eq("laneInvalidationPending", ...) select rows the
 * way the real indexes would.
 */
function createLaneCtx({
  activePublishAttempt = null,
  explorerOps = [],
  mediaOps = [],
  documents = [],
  publishBranches = [],
}: {
  activePublishAttempt?: Record<string, unknown> | null
  explorerOps?: Array<Record<string, unknown>>
  mediaOps?: Array<Record<string, unknown>>
  documents?: Array<Record<string, unknown>>
  publishBranches?: Array<Record<string, unknown>>
} = {}) {
  const rowsById = new Map<string, Record<string, unknown>>()
  for (const row of [project, ...explorerOps, ...mediaOps, ...documents, ...publishBranches]) {
    rowsById.set(String(row._id), row)
  }

  const captureEq = (cb?: (q: unknown) => unknown) => {
    const values: Record<string, unknown> = {}
    const recorder: Record<string, unknown> = {
      eq: (field: string, value: unknown) => {
        values[field] = value
        return recorder
      },
    }
    cb?.(recorder)
    return values
  }

  const rowsFor = (table: string, eq: Record<string, unknown>) => {
    if (table === "publishAttempts") {
      return activePublishAttempt && activePublishAttempt.status === eq.status ? [activePublishAttempt] : []
    }
    const source =
      table === "explorerOps"
        ? explorerOps
        : table === "mediaOps"
          ? mediaOps
          : table === "documents"
            ? documents
            : table === "publishBranches"
              ? publishBranches
              : []
    return source.filter((row) =>
      Object.entries(eq).every(([field, value]) => field === "projectId" || row[field] === value),
    )
  }

  const chain = (rows: Array<Record<string, unknown>>): any => ({
    first: vi.fn().mockImplementation(async () => rows[0] ?? null),
    collect: vi.fn().mockImplementation(async () => rows),
    take: vi.fn().mockImplementation(async (count: number) => rows.slice(0, count)),
    filter: () => chain(rows),
  })

  const patch = vi.fn().mockImplementation(async (id: string, values: Record<string, unknown>) => {
    const row = rowsById.get(String(id))
    if (row) Object.assign(row, values)
  })
  const del = vi.fn()

  return {
    db: {
      get: vi.fn().mockImplementation(async (id: string) => rowsById.get(String(id)) ?? null),
      patch,
      delete: del,
      insert: vi.fn(),
      query: vi.fn((table: string) => ({
        withIndex: (_indexName: string, cb?: (q: unknown) => unknown) => chain(rowsFor(table, captureEq(cb))),
        // cleanupStaleUploads' stale-pending pass uses a bare filter().take().
        filter: () => chain([]),
      })),
    },
    scheduler: { runAfter: vi.fn() },
    storage: { delete: vi.fn() },
  } as any
}

describe("closed-lane synchronization invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    safeGetAuthUserMock.mockResolvedValue(null)
  })

  it("restores the lane's committed ops, media, and document provenance for republishing", async () => {
    const ctx = createLaneCtx({
      explorerOps: [
        {
          _id: "op_lane",
          projectId: "project_1",
          opType: "create",
          filePath: "guides/a.mdx",
          pathRepresentation: "content_relative_v1",
          status: "committed",
          publishBranchId: "lane_1",
          updatedAt: 10,
        },
        {
          _id: "op_other_lane",
          projectId: "project_1",
          opType: "create",
          filePath: "guides/other.mdx",
          pathRepresentation: "content_relative_v1",
          status: "committed",
          publishBranchId: "lane_OTHER",
          updatedAt: 10,
        },
      ],
      mediaOps: [
        {
          _id: "media_lane",
          projectId: "project_1",
          repoPath: "/public/x.png",
          status: "committed",
          publishBranchId: "lane_1",
          convexStorageId: "storage_1",
          updatedAt: 10,
        },
      ],
      documents: [
        {
          _id: "doc_lane",
          projectId: "project_1",
          updatedAt: 10,
          publishedProvenance: { publishBranchId: "lane_1", commitSha: "commit-1", publishedUpdatedAt: 10 },
        },
        {
          _id: "doc_other_lane",
          projectId: "project_1",
          updatedAt: 10,
          publishedProvenance: { publishBranchId: "lane_OTHER", commitSha: "commit-2", publishedUpdatedAt: 10 },
        },
      ],
    })

    const result = await invalidateClosedLaneSync(ctx, laneDoc() as any)

    expect(result).toEqual({
      deferred: false,
      restoredOpIds: ["op_lane"],
      discardedOpIds: [],
      restoredMediaOpIds: ["media_lane"],
      discardedMediaOpIds: [],
      invalidatedDocumentIds: ["doc_lane"],
    })
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "op_lane",
      expect.objectContaining({ status: "pending", commitSha: undefined, publishBranchId: undefined }),
    )
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "media_lane",
      expect.objectContaining({ status: "pending", commitSha: undefined, publishBranchId: undefined }),
    )
    expect(ctx.db.patch).toHaveBeenCalledWith("doc_lane", { publishedProvenance: undefined })
    // Restoring keeps the staged bytes - nothing is deleted.
    expect(ctx.storage.delete).not.toHaveBeenCalled()
    expect(ctx.db.delete).not.toHaveBeenCalled()
    // Other lanes' rows are untouched.
    expect(ctx.db.patch).not.toHaveBeenCalledWith("op_other_lane", expect.anything())
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_other_lane", expect.anything())
  })

  it("discards committed rows superseded by newer pending intent on the same path", async () => {
    const ctx = createLaneCtx({
      explorerOps: [
        {
          _id: "op_committed",
          projectId: "project_1",
          opType: "create",
          filePath: "guides/a.mdx",
          pathRepresentation: "content_relative_v1",
          status: "committed",
          publishBranchId: "lane_1",
          updatedAt: 10,
        },
        {
          _id: "op_pending_same_path",
          projectId: "project_1",
          opType: "delete",
          filePath: "guides/a.mdx",
          pathRepresentation: "content_relative_v1",
          status: "pending",
          updatedAt: 20,
        },
      ],
      mediaOps: [
        {
          _id: "media_committed",
          projectId: "project_1",
          repoPath: "/public/x.png",
          status: "committed",
          publishBranchId: "lane_1",
          convexStorageId: "storage_old",
          updatedAt: 10,
        },
        {
          _id: "media_pending_same_path",
          projectId: "project_1",
          repoPath: "/public/x.png",
          status: "pending",
          convexStorageId: "storage_new",
          updatedAt: 20,
        },
      ],
    })

    const result = await invalidateClosedLaneSync(ctx, laneDoc() as any)

    expect(result).toEqual(
      expect.objectContaining({
        restoredOpIds: [],
        discardedOpIds: ["op_committed"],
        restoredMediaOpIds: [],
        discardedMediaOpIds: ["media_committed"],
      }),
    )
    expect(ctx.db.delete).toHaveBeenCalledWith("op_committed")
    expect(ctx.db.delete).toHaveBeenCalledWith("media_committed")
    // Only the superseded committed bytes are deleted; the pending upload keeps its object.
    expect(ctx.storage.delete).toHaveBeenCalledWith("storage_old")
    expect(ctx.storage.delete).not.toHaveBeenCalledWith("storage_new")
    expect(ctx.db.patch).not.toHaveBeenCalledWith("op_pending_same_path", expect.anything())
  })

  it("cancels out a create+delete pair on the same path (net zero against the base branch)", async () => {
    const ctx = createLaneCtx({
      explorerOps: [
        {
          _id: "op_create",
          projectId: "project_1",
          opType: "create",
          filePath: "guides/a.mdx",
          pathRepresentation: "content_relative_v1",
          status: "committed",
          publishBranchId: "lane_1",
          updatedAt: 10,
        },
        {
          _id: "op_delete",
          projectId: "project_1",
          opType: "delete",
          filePath: "guides/a.mdx",
          pathRepresentation: "content_relative_v1",
          status: "committed",
          publishBranchId: "lane_1",
          updatedAt: 20,
        },
      ],
    })

    const result = await invalidateClosedLaneSync(ctx, laneDoc() as any)

    expect(result).toEqual(
      expect.objectContaining({
        restoredOpIds: [],
        discardedOpIds: expect.arrayContaining(["op_create", "op_delete"]),
      }),
    )
    expect(ctx.db.delete).toHaveBeenCalledWith("op_create")
    expect(ctx.db.delete).toHaveBeenCalledWith("op_delete")
  })

  it("defers durably while a publish attempt is at the commit boundary", async () => {
    const ctx = createLaneCtx({
      activePublishAttempt: {
        _id: "attempt_1",
        projectId: "project_1",
        branchName: "repopress/start",
        planDigest: "d".repeat(64),
        status: "committing",
      },
      explorerOps: [
        {
          _id: "op_lane",
          projectId: "project_1",
          opType: "create",
          filePath: "guides/a.mdx",
          pathRepresentation: "content_relative_v1",
          status: "committed",
          publishBranchId: "lane_1",
          updatedAt: 10,
        },
      ],
      publishBranches: [laneDoc()],
    })

    const result = await invalidateClosedLaneSync(ctx, laneDoc() as any)

    expect(result).toEqual({ deferred: true })
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ laneInvalidationPending: true }))
    expect(ctx.db.patch).not.toHaveBeenCalledWith("op_lane", expect.anything())
  })

  it("markClosed (client fallback path) closes the lane AND invalidates its synchronization", async () => {
    const lane = laneDoc({ status: "active" })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      documents: [
        {
          _id: "doc_lane",
          projectId: "project_1",
          updatedAt: 10,
          publishedProvenance: { publishBranchId: "lane_1", commitSha: "commit-1", publishedUpdatedAt: 10 },
        },
      ],
    })

    const result = await (markClosed as any).handler(ctx, {
      id: "lane_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ status: "closed" }))
    expect(ctx.db.patch).toHaveBeenCalledWith("doc_lane", { publishedProvenance: undefined })
    expect(result).toEqual(expect.objectContaining({ deferred: false, invalidatedDocumentIds: ["doc_lane"] }))
  })

  it("handlePRClosed (webhook path) closes the lane AND invalidates its synchronization", async () => {
    const lane = laneDoc({ status: "active" })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: [
        {
          _id: "op_lane",
          projectId: "project_1",
          opType: "delete",
          filePath: "guides/a.mdx",
          pathRepresentation: "content_relative_v1",
          status: "committed",
          publishBranchId: "lane_1",
          updatedAt: 10,
        },
      ],
    })

    await (handlePRClosed as any).handler(ctx, {
      prNumber: 42,
      serverQueryToken: await mintServerQueryToken(),
    })

    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ status: "closed" }))
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "op_lane",
      expect.objectContaining({ status: "pending", publishBranchId: undefined }),
    )
  })

  it("finishLaneInvalidation refuses lanes that are not closed", async () => {
    const ctx = createLaneCtx({ publishBranches: [laneDoc({ status: "active" })] })

    await expect(
      (finishLaneInvalidation as any).handler(ctx, {
        id: "lane_1",
        userId: "user_owner",
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/closed publish lanes/i)
  })

  it("finishLaneInvalidation completes a deferred invalidation and clears the flag", async () => {
    const lane = laneDoc({ laneInvalidationPending: true })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: [
        {
          _id: "op_lane",
          projectId: "project_1",
          opType: "create",
          filePath: "guides/a.mdx",
          pathRepresentation: "content_relative_v1",
          status: "committed",
          publishBranchId: "lane_1",
          updatedAt: 10,
        },
      ],
    })

    const result = await (finishLaneInvalidation as any).handler(ctx, {
      id: "lane_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(result).toEqual(expect.objectContaining({ deferred: false, restoredOpIds: ["op_lane"] }))
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ laneInvalidationPending: undefined }))
  })

  it("the nightly cron drains deferred invalidations once the attempt resolves", async () => {
    const lane = laneDoc({ laneInvalidationPending: true })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      documents: [
        {
          _id: "doc_lane",
          projectId: "project_1",
          updatedAt: 10,
          publishedProvenance: { publishBranchId: "lane_1", commitSha: "commit-1", publishedUpdatedAt: 10 },
        },
      ],
    })

    const result = await (cleanupStaleUploads as any).handler(ctx, {})

    expect(result).toEqual({ processed: 0, lanesInvalidated: 1 })
    expect(ctx.db.patch).toHaveBeenCalledWith("doc_lane", { publishedProvenance: undefined })
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ laneInvalidationPending: undefined }))
  })

  it("the nightly cron keeps deferring while the project's attempt is still active", async () => {
    const lane = laneDoc({ laneInvalidationPending: true })
    const ctx = createLaneCtx({
      activePublishAttempt: {
        _id: "attempt_1",
        projectId: "project_1",
        branchName: "repopress/start",
        planDigest: "d".repeat(64),
        status: "committed",
      },
      publishBranches: [lane],
      documents: [
        {
          _id: "doc_lane",
          projectId: "project_1",
          updatedAt: 10,
          publishedProvenance: { publishBranchId: "lane_1", commitSha: "commit-1", publishedUpdatedAt: 10 },
        },
      ],
    })

    const result = await (cleanupStaleUploads as any).handler(ctx, {})

    expect(result).toEqual({ processed: 0, lanesInvalidated: 0 })
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_lane", expect.anything())
  })
})
