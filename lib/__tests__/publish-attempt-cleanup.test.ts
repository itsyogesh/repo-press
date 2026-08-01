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

import * as explorerOpsModule from "@/convex/explorerOps"
import { CLEANUP_BATCH_SIZE } from "@/convex/lib/publishAttemptCleanup"
import { continueCleanup, resumePendingCleanups } from "@/convex/publishAttemptCleanups"
import {
  getActiveForProject,
  getNewestUnresolvedForLane,
  markReconciled,
  recordCommit,
  resolveAndEnqueueCleanup,
  resumeCleanup,
  supersede,
  supersedeClosedPending,
} from "@/convex/publishAttempts"
import { mintServerQueryToken } from "@/lib/project-access-token"

type Row = Record<string, any> & { _id: string }

const project: Row = {
  _id: "project_1",
  userId: "user_owner",
  repoOwner: "acme",
  repoName: "docs",
  contentRoot: "content",
}
const lane: Row = {
  _id: "lane_1",
  projectId: "project_1",
  branchName: "repopress/start",
  baseBranch: "main",
  status: "merged",
  mergeCommitSha: "3".repeat(40),
  mergeVerificationState: "pending",
}
const attempt: Row = {
  _id: "attempt_1",
  projectId: "project_1",
  publishBranchId: "lane_1",
  branchName: "repopress/start",
  expectedHeadSha: "a".repeat(40),
  planDigest: "d".repeat(64),
  operationDescriptors: [
    { path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) },
    { path: "public/pic.png", action: "create", expectedBlobSha: "c".repeat(40) },
  ],
  operationPaths: ["content/a.mdx", "public/pic.png"],
  opIds: ["op_1"],
  explorerAssociations: [{ opId: "op_1", repoPath: "content/a.mdx", expectedUpdatedAt: 10 }],
  mediaAssociations: [{ mediaOpId: "media_1", repoPath: "public/pic.png", expectedUpdatedAt: 10 }],
  documentAssociations: [
    {
      documentId: "doc_1",
      repoPath: "content/a.mdx",
      expectedUpdatedAt: 10,
      contentRevision: "e".repeat(64),
      contentVersion: 3,
    },
  ],
  deleteAssociations: [],
  status: "reconciled",
  commitSha: "1".repeat(40),
  createdAt: 1,
  updatedAt: 10,
}

const outcomes = [
  { path: "content/a.mdx", disposition: "finalize", finalBlobSha: "b".repeat(40) },
  { path: "public/pic.png", disposition: "restore" },
] as const

let serverQueryToken: string

beforeEach(async () => {
  process.env.BETTER_AUTH_SECRET = "publish-cleanup-test-secret"
  serverQueryToken = await mintServerQueryToken()
})

function createCtx(initialRows: Row[]) {
  const tables = new Map<string, Row[]>([
    ["projects", initialRows.filter((row) => row._id.startsWith("project_"))],
    ["publishBranches", initialRows.filter((row) => row._id.startsWith("lane_"))],
    ["publishAttempts", initialRows.filter((row) => row._id.startsWith("attempt_"))],
    ["publishAttemptCleanups", initialRows.filter((row) => row._id.startsWith("cleanup_"))],
    ["publishLanePathResolutions", initialRows.filter((row) => row._id.startsWith("claim_"))],
    ["explorerOps", initialRows.filter((row) => row._id.startsWith("op_"))],
    ["mediaOps", initialRows.filter((row) => row._id.startsWith("media_"))],
    ["documents", initialRows.filter((row) => row._id.startsWith("doc_"))],
  ])
  const deleted = new Set<string>()
  const byId = () => new Map([...tables.values()].flat().map((row) => [String(row._id), row]))
  const eqValues = (cb?: (q: any) => unknown) => {
    const values: Record<string, unknown> = {}
    const recorder: any = {
      eq(field: string, value: unknown) {
        values[field] = value
        return recorder
      },
    }
    cb?.(recorder)
    return values
  }
  const queryRows = (table: string, eq: Record<string, unknown>) =>
    (tables.get(table) ?? []).filter(
      (row) => !deleted.has(row._id) && Object.entries(eq).every(([field, value]) => row[field] === value),
    )
  const chain = (rows: Row[]) => ({
    first: vi.fn(async () => rows[0] ?? null),
    order: vi.fn((direction: "asc" | "desc") =>
      chain(
        [...rows].sort((a, b) =>
          direction === "asc" ? (a.createdAt ?? 0) - (b.createdAt ?? 0) : (b.createdAt ?? 0) - (a.createdAt ?? 0),
        ),
      ),
    ),
    take: vi.fn(async (count: number) => rows.slice(0, count)),
    collect: vi.fn(async () => {
      throw new Error("cleanup must not call collect")
    }),
    filter: vi.fn(() => chain(rows)),
  })
  const patch = vi.fn(async (id: string, values: Record<string, unknown>) => {
    const row = byId().get(String(id))
    if (!row) throw new Error(`missing row ${id}`)
    Object.assign(row, values)
  })
  const insert = vi.fn(async (table: string, values: Record<string, unknown>) => {
    const id =
      table === "publishAttemptCleanups"
        ? "cleanup_1"
        : table === "publishLanePathResolutions"
          ? `claim_${(tables.get(table) ?? []).length + 1}`
          : `${table}_${(tables.get(table) ?? []).length + 1}`
    const row = { _id: id, ...values } as Row
    tables.set(table, [...(tables.get(table) ?? []), row])
    return id
  })
  const remove = vi.fn(async (id: string) => {
    deleted.add(String(id))
  })
  const storageDelete = vi.fn(async (_id: string) => undefined)
  return {
    db: {
      get: vi.fn(async (id: string) => byId().get(String(id)) ?? null),
      insert,
      patch,
      delete: remove,
      query: vi.fn((table: string) => ({
        withIndex: vi.fn((_name: string, cb?: (q: any) => unknown) => chain(queryRows(table, eqValues(cb)))),
      })),
    },
    scheduler: { runAfter: vi.fn(async () => "scheduled_1") },
    storage: { delete: storageDelete },
    _tables: tables,
    _deleted: deleted,
  } as any
}

function cleanupRow(overrides: Record<string, unknown> = {}): Row {
  return {
    _id: "cleanup_1",
    projectId: "project_1",
    laneId: "lane_1",
    attemptId: "attempt_1",
    pathOutcomes: outcomes.map((outcome) => ({ ...outcome })),
    authoritySha: "3".repeat(40),
    phase: "explorer",
    cursor: 0,
    status: "pending",
    createdAt: 11,
    updatedAt: 11,
    ...overrides,
  }
}

function expectNoCleanupWrites(ctx: ReturnType<typeof createCtx>, cleanup: Row) {
  expect(ctx.db.patch).not.toHaveBeenCalled()
  expect(ctx.db.delete).not.toHaveBeenCalled()
  expect(ctx.db.insert).not.toHaveBeenCalled()
  expect(ctx.storage.delete).not.toHaveBeenCalled()
  expect(ctx.scheduler.runAfter).not.toHaveBeenCalled()
  expect(cleanup.cursor).toBe(0)
}

describe("publish attempt cleanup enqueue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue({ _id: "user_owner" })
  })

  it("selects unresolved merged-lane attempts newest-first across statuses", async () => {
    const olderCommitting = { ...attempt, status: "committing", createdAt: 1, updatedAt: 1 }
    const newerReconciled = {
      ...attempt,
      _id: "attempt_2",
      status: "reconciled",
      createdAt: 2,
      updatedAt: 2,
    }
    const ctx = createCtx([
      { ...project },
      { ...lane, mergeCommitSha: "3".repeat(40), mergeVerificationState: "pending" },
      olderCommitting,
      newerReconciled,
    ])

    const selected = await (getActiveForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
    })

    expect(selected?._id).toBe("attempt_2")
  })

  it("selects unresolved closed-lane attempts newest-first for the exact lane", async () => {
    const olderCommitted = { ...attempt, status: "committed", createdAt: 1, updatedAt: 1 }
    const newerReconciled = {
      ...attempt,
      _id: "attempt_2",
      status: "reconciled",
      createdAt: 2,
      updatedAt: 2,
    }
    const otherLaneAttempt = {
      ...attempt,
      _id: "attempt_other",
      publishBranchId: "lane_other",
      status: "reconciled",
      createdAt: 3,
      updatedAt: 3,
    }
    const ctx = createCtx([
      { ...project },
      { ...lane, status: "closed" },
      olderCommitted,
      newerReconciled,
      otherLaneAttempt,
    ])

    const selected = await (getNewestUnresolvedForLane as any).handler(ctx, {
      projectId: "project_1",
      laneId: "lane_1",
      userId: "user_owner",
    })

    expect(selected?._id).toBe("attempt_2")
  })

  it("atomically installs an immutable cleanup plan, keeps the guard active, and schedules it", async () => {
    const ctx = createCtx([{ ...project }, { ...lane }, { ...attempt }])

    const result = await (resolveAndEnqueueCleanup as any).handler(ctx, {
      id: "attempt_1",
      authoritySha: "3".repeat(40),
      pathOutcomes: outcomes,
      serverQueryToken,
      userId: "user_owner",
    })

    expect(result).toEqual({ cleanupId: "cleanup_1", reused: false })
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "publishAttemptCleanups",
      expect.objectContaining({
        attemptId: "attempt_1",
        laneId: "lane_1",
        phase: "explorer",
        cursor: 0,
        status: "pending",
        pathOutcomes: outcomes,
      }),
    )
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "attempt_1",
      expect.objectContaining({ status: "cleanup_pending", cleanupId: "cleanup_1" }),
    )
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), { cleanupId: "cleanup_1" })
  })

  it("persists a discard outcome when a newer merged attempt already claimed the final path", async () => {
    const singlePathAttempt = {
      ...attempt,
      operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
      operationPaths: ["content/a.mdx"],
      mediaAssociations: [],
    }
    const ctx = createCtx([
      { ...project },
      { ...lane, mergeCommitSha: "3".repeat(40), mergeVerificationState: "pending" },
      singlePathAttempt,
      {
        _id: "claim_newer",
        projectId: "project_1",
        laneId: "lane_1",
        authoritySha: "3".repeat(40),
        repoPath: "content/a.mdx",
        claimedAttemptId: "attempt_2",
        finalPathState: "blob",
        finalBlobSha: "c".repeat(40),
        createdAt: 20,
        updatedAt: 20,
      },
    ])

    await (resolveAndEnqueueCleanup as any).handler(ctx, {
      id: "attempt_1",
      authoritySha: "3".repeat(40),
      pathOutcomes: [{ path: "content/a.mdx", disposition: "finalize", finalBlobSha: "b".repeat(40) }],
      serverQueryToken,
      userId: "user_owner",
    })

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "publishAttemptCleanups",
      expect.objectContaining({
        pathOutcomes: [{ path: "content/a.mdx", disposition: "discard", finalBlobSha: "c".repeat(40) }],
      }),
    )
  })

  it("persists verified absence when a newer merged attempt claimed a deleted final path", async () => {
    const singlePathAttempt = {
      ...attempt,
      operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
      operationPaths: ["content/a.mdx"],
      mediaAssociations: [],
    }
    const ctx = createCtx([
      { ...project },
      { ...lane },
      singlePathAttempt,
      {
        _id: "claim_newer",
        projectId: "project_1",
        laneId: "lane_1",
        authoritySha: "3".repeat(40),
        repoPath: "content/a.mdx",
        claimedAttemptId: "attempt_2",
        finalPathState: "absent",
        createdAt: 20,
        updatedAt: 20,
      },
    ])

    await (resolveAndEnqueueCleanup as any).handler(ctx, {
      id: "attempt_1",
      authoritySha: "3".repeat(40),
      pathOutcomes: [{ path: "content/a.mdx", disposition: "restore" }],
      serverQueryToken,
      userId: "user_owner",
    })

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "publishAttemptCleanups",
      expect.objectContaining({
        pathOutcomes: [{ path: "content/a.mdx", disposition: "discard" }],
      }),
    )
  })

  it("allows a merged committing attempt without an original commit SHA to install exact cleanup", async () => {
    const committing = {
      ...attempt,
      status: "committing",
      commitSha: undefined,
      operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
      operationPaths: ["content/a.mdx"],
      mediaAssociations: [],
    }
    const ctx = createCtx([
      { ...project },
      { ...lane, mergeCommitSha: "3".repeat(40), mergeVerificationState: "pending" },
      committing,
    ])

    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        authoritySha: "3".repeat(40),
        pathOutcomes: [{ path: "content/a.mdx", disposition: "finalize", finalBlobSha: "b".repeat(40) }],
        serverQueryToken,
        userId: "user_owner",
      }),
    ).resolves.toEqual({ cleanupId: "cleanup_1", reused: false })

    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "attempt_1",
      expect.objectContaining({ commitSha: expect.any(String) }),
    )
  })

  it("supersedes a closed committing attempt only while every exact association remains pending", async () => {
    const committing = {
      ...attempt,
      status: "committing",
      commitSha: undefined,
      mediaAssociations: [],
    }
    const pendingOp = {
      _id: "op_1",
      projectId: "project_1",
      repoPath: "content/a.mdx",
      filePath: "a.mdx",
      pathRepresentation: "content_relative_v1",
      opType: "update",
      status: "pending",
      updatedAt: 10,
    }
    const doc = {
      _id: "doc_1",
      projectId: "project_1",
      filePath: "a.mdx",
      pathRepresentation: "content_relative_v1",
      status: "draft",
      updatedAt: 10,
      contentVersion: 3,
    }
    const ctx = createCtx([
      { ...project, contentRoot: "content" },
      { ...lane, status: "closed" },
      committing,
      pendingOp,
      doc,
    ])

    await expect(
      (supersedeClosedPending as any).handler(ctx, {
        id: "attempt_1",
        serverQueryToken,
        userId: "user_owner",
      }),
    ).resolves.toBeUndefined()
    expect(ctx.db.patch).toHaveBeenCalledWith("attempt_1", expect.objectContaining({ status: "superseded" }))

    const raced = createCtx([
      { ...project, contentRoot: "content" },
      { ...lane, status: "closed" },
      { ...committing, status: "committing", commitSha: undefined },
      { ...pendingOp, status: "undone" },
      { ...doc },
    ])
    await expect(
      (supersedeClosedPending as any).handler(raced, {
        id: "attempt_1",
        serverQueryToken,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/no longer pending/i)
    expect(raced.db.patch).not.toHaveBeenCalledWith("attempt_1", expect.objectContaining({ status: "superseded" }))
  })

  it("reuses an identical plan without duplicating it and fails closed on a conflicting replay", async () => {
    const existing = cleanupRow()
    const ctx = createCtx([
      { ...project },
      { ...lane },
      { ...attempt, status: "cleanup_pending", cleanupId: "cleanup_1" },
      existing,
    ])

    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        authoritySha: "3".repeat(40),
        pathOutcomes: outcomes,
        serverQueryToken,
        userId: "user_owner",
      }),
    ).resolves.toEqual({ cleanupId: "cleanup_1", reused: true })
    expect(ctx.db.insert).not.toHaveBeenCalled()
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1)

    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        authoritySha: "3".repeat(40),
        pathOutcomes: [{ path: outcomes[0].path, disposition: "restore" }, outcomes[1]],
        serverQueryToken,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/conflicting cleanup plan/i)
  })

  it("requeues the exact persisted cleanup without creating another plan", async () => {
    const existing = cleanupRow({ phase: "media", cursor: 7 })
    const ctx = createCtx([
      { ...project },
      { ...lane },
      { ...attempt, status: "cleanup_pending", cleanupId: "cleanup_1" },
      existing,
    ])

    await expect(
      (resumeCleanup as any).handler(ctx, {
        id: "attempt_1",
        serverQueryToken,
        userId: "user_owner",
      }),
    ).resolves.toEqual({ cleanupId: "cleanup_1", scheduled: true })

    expect(ctx.db.insert).not.toHaveBeenCalled()
    expect(existing.phase).toBe("media")
    expect(existing.cursor).toBe(7)
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1)
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), { cleanupId: "cleanup_1" })
  })

  it("watchdogs pending cleanups in a bounded batch and advances their retry cursor", async () => {
    const pending = Array.from({ length: 30 }, (_, index) =>
      cleanupRow({
        _id: `cleanup_${index + 1}`,
        attemptId: `attempt_${index + 1}`,
        createdAt: index + 1,
        updatedAt: index + 1,
      }),
    )
    const ctx = createCtx(pending)

    const result = await (resumePendingCleanups as any).handler(ctx, {})

    expect(result).toEqual({ scheduled: 25 })
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(25)
    expect(ctx.db.patch).toHaveBeenCalledTimes(25)
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "cleanup_1",
      expect.objectContaining({ lastRescheduledAt: expect.any(Number) }),
    )
  })

  it("requires server proof for Git-truth attempt transitions and validates commit SHAs", async () => {
    const committing = { ...attempt, status: "committing", commitSha: undefined }
    const ctx = createCtx([{ ...project }, { ...lane, status: "active" }, committing])

    await expect(
      (recordCommit as any).handler(ctx, {
        id: "attempt_1",
        commitSha: "1".repeat(40),
        userId: "user_owner",
      }),
    ).rejects.toThrow(/server proof/i)
    await expect((supersede as any).handler(ctx, { id: "attempt_1", userId: "user_owner" })).rejects.toThrow(
      /server proof/i,
    )
    await expect(
      (recordCommit as any).handler(ctx, {
        id: "attempt_1",
        commitSha: "not-a-sha",
        serverQueryToken,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/commit sha/i)

    await (recordCommit as any).handler(ctx, {
      id: "attempt_1",
      commitSha: "1".repeat(40),
      serverQueryToken,
      userId: "user_owner",
    })
    await expect((markReconciled as any).handler(ctx, { id: "attempt_1", userId: "user_owner" })).rejects.toThrow(
      /server proof/i,
    )
    await expect(
      (markReconciled as any).handler(ctx, {
        id: "attempt_1",
        serverQueryToken,
        userId: "user_owner",
      }),
    ).resolves.toBeUndefined()

    const supersedeCtx = createCtx([
      { ...project },
      { ...lane, status: "active" },
      { ...attempt, status: "committing", commitSha: undefined },
    ])
    await expect(
      (supersede as any).handler(supersedeCtx, {
        id: "attempt_1",
        serverQueryToken,
        userId: "user_owner",
      }),
    ).resolves.toBeUndefined()
    expect(supersedeCtx.db.patch).toHaveBeenCalledWith("attempt_1", expect.objectContaining({ status: "superseded" }))
  })

  it("does not expose bulk committed-operation deletion to editors", () => {
    expect((explorerOpsModule as Record<string, unknown>).clearCommittedForProject).toBeUndefined()
  })

  it("rejects outcomes outside the attempt and finalize plans without an authority", async () => {
    const ctx = createCtx([{ ...project }, { ...lane }, { ...attempt }])
    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        pathOutcomes: outcomes,
        serverQueryToken,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/authority/i)
    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        authoritySha: "3".repeat(40),
        pathOutcomes: [...outcomes, { path: "content/not-in-plan.mdx", disposition: "restore" }],
        serverQueryToken,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/exactly match/i)
  })

  it("requires final tree blob evidence for finalized writes", async () => {
    const ctx = createCtx([{ ...project }, { ...lane }, { ...attempt }])

    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        authoritySha: "3".repeat(40),
        pathOutcomes: [
          { path: "content/a.mdx", disposition: "finalize" },
          { path: "public/pic.png", disposition: "restore" },
        ],
        serverQueryToken,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/finalized write.*blob/i)
  })

  it("rejects enqueue when a persisted association is outside the descriptor closure", async () => {
    const ctx = createCtx([
      { ...project },
      { ...lane },
      {
        ...attempt,
        documentAssociations: [
          {
            documentId: "doc_1",
            repoPath: "content/unplanned.mdx",
            expectedUpdatedAt: 10,
            contentRevision: "e".repeat(64),
            contentVersion: 3,
          },
        ],
      },
    ])

    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        authoritySha: "3".repeat(40),
        pathOutcomes: outcomes,
        serverQueryToken,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/association.*descriptor/i)
    expect(ctx.db.insert).not.toHaveBeenCalled()
  })

  it("rejects editor-authorized cleanup enqueue without server proof", async () => {
    const ctx = createCtx([{ ...project }, { ...lane }, { ...attempt }])

    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        authoritySha: "3".repeat(40),
        pathOutcomes: outcomes,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/server/i)

    expect(ctx.db.insert).not.toHaveBeenCalled()
    expect(ctx.db.patch).not.toHaveBeenCalled()
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled()
  })

  it("derives merged authority from the lane even when the old arbitration flag is false or omitted", async () => {
    const restoreOnly = outcomes.map(({ path }) => ({ path, disposition: "restore" as const }))

    for (const oldFlag of [false, undefined]) {
      const ctx = createCtx([{ ...project }, { ...lane }, { ...attempt }])
      await expect(
        (resolveAndEnqueueCleanup as any).handler(ctx, {
          id: "attempt_1",
          authoritySha: oldFlag === false ? undefined : "4".repeat(40),
          pathOutcomes: restoreOnly,
          ...(oldFlag === undefined ? {} : { arbitrateMergedPaths: oldFlag }),
          serverQueryToken,
          userId: "user_owner",
        }),
      ).rejects.toThrow(/merge authority/i)
      expect(ctx.db.insert).not.toHaveBeenCalled()
      expect(ctx.db.patch).not.toHaveBeenCalled()
    }
  })

  it("rejects finalize or discard cleanup plans for a closed lane", async () => {
    const ctx = createCtx([{ ...project }, { ...lane, status: "closed" }, { ...attempt }])

    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        authoritySha: "3".repeat(40),
        pathOutcomes: outcomes,
        serverQueryToken,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/closed.*restore/i)

    expect(ctx.db.insert).not.toHaveBeenCalled()
    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("rejects a merged cleanup plan without a nonempty base branch before arbitration writes", async () => {
    const ctx = createCtx([{ ...project }, { ...lane, baseBranch: "" }, { ...attempt }])

    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        authoritySha: "3".repeat(40),
        pathOutcomes: outcomes,
        serverQueryToken,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/base branch/i)

    expect(ctx.db.insert).not.toHaveBeenCalled()
    expect(ctx.db.patch).not.toHaveBeenCalled()
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled()
  })
})

describe("bounded attempt-scoped cleanup continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue({ _id: "user_owner" })
  })

  it("rejects stale merged authority before explorer cleanup mutates or advances", async () => {
    const staleCleanup = cleanupRow({ authoritySha: "4".repeat(40), phase: "explorer" })
    const cleanupAttempt = { ...attempt, status: "cleanup_pending", cleanupId: "cleanup_1" }
    const ctx = createCtx([
      { ...project },
      { ...lane },
      cleanupAttempt,
      staleCleanup,
      {
        _id: "op_1",
        projectId: "project_1",
        repoPath: "content/a.mdx",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 10,
      },
    ])

    await expect((continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })).rejects.toThrow(/merge authority/i)
    expectNoCleanupWrites(ctx, staleCleanup)
  })

  it("rejects a corrupt closed finalize plan before media or storage mutation", async () => {
    const corruptCleanup = cleanupRow({ phase: "media", authoritySha: undefined })
    const cleanupAttempt = { ...attempt, status: "cleanup_pending", cleanupId: "cleanup_1" }
    const ctx = createCtx([
      { ...project },
      { ...lane, status: "closed" },
      cleanupAttempt,
      corruptCleanup,
      {
        _id: "media_1",
        projectId: "project_1",
        repoPath: "public/pic.png",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        convexStorageId: "storage_1",
        updatedAt: 10,
      },
    ])

    await expect((continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })).rejects.toThrow(/closed.*restore/i)
    expectNoCleanupWrites(ctx, corruptCleanup)
  })

  it.each([
    {
      name: "empty merged base branch",
      phase: "media",
      laneOverrides: { baseBranch: "" },
      pathOutcomes: outcomes,
      error: /base branch/i,
    },
    {
      name: "mismatched finalized write blob",
      phase: "explorer",
      pathOutcomes: [{ path: "content/a.mdx", disposition: "finalize", finalBlobSha: "9".repeat(40) }, outcomes[1]],
      error: /blob/i,
    },
    {
      name: "missing finalized write blob",
      phase: "media",
      pathOutcomes: [outcomes[0], { path: "public/pic.png", disposition: "finalize" }],
      error: /blob/i,
    },
    {
      name: "duplicate outcome",
      phase: "explorer",
      pathOutcomes: [...outcomes, { ...outcomes[1] }],
      error: /exactly match|duplicate/i,
    },
    {
      name: "extra outcome",
      phase: "media",
      pathOutcomes: [...outcomes, { path: "content/extra.mdx", disposition: "restore" }],
      error: /exactly match/i,
    },
    {
      name: "noncanonical outcome",
      phase: "explorer",
      pathOutcomes: [...outcomes, { path: "/content/extra.mdx", disposition: "restore" }],
      error: /canonical|path/i,
    },
  ])("rejects $name before $phase cleanup writes", async ({ phase, laneOverrides, pathOutcomes, error }) => {
    const corruptCleanup = cleanupRow({ phase, pathOutcomes })
    const cleanupAttempt = { ...attempt, status: "cleanup_pending", cleanupId: "cleanup_1" }
    const ctx = createCtx([
      { ...project },
      { ...lane, ...laneOverrides },
      cleanupAttempt,
      corruptCleanup,
      {
        _id: "op_1",
        projectId: "project_1",
        repoPath: "content/a.mdx",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 10,
      },
      {
        _id: "media_1",
        projectId: "project_1",
        repoPath: "public/pic.png",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        convexStorageId: "storage_1",
        updatedAt: 10,
      },
    ])

    await expect((continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })).rejects.toThrow(error)
    expectNoCleanupWrites(ctx, corruptCleanup)
  })

  it.each([
    {
      name: "invalid document content revision",
      phase: "explorer",
      buildAttempt: () => ({
        ...attempt,
        documentAssociations: [{ ...attempt.documentAssociations[0], contentRevision: "not-a-digest" }],
      }),
    },
    {
      name: "negative document content version",
      phase: "explorer",
      buildAttempt: () => ({
        ...attempt,
        documentAssociations: [{ ...attempt.documentAssociations[0], contentVersion: -1 }],
      }),
    },
    {
      name: "fractional document content version",
      phase: "media",
      buildAttempt: () => ({
        ...attempt,
        documentAssociations: [{ ...attempt.documentAssociations[0], contentVersion: 1.5 }],
      }),
    },
    {
      name: "nonfinite explorer snapshot timestamp",
      phase: "explorer",
      buildAttempt: () => ({
        ...attempt,
        explorerAssociations: [{ ...attempt.explorerAssociations[0], expectedUpdatedAt: Number.NaN }],
      }),
    },
    {
      name: "negative media snapshot timestamp",
      phase: "media",
      buildAttempt: () => ({
        ...attempt,
        mediaAssociations: [{ ...attempt.mediaAssociations[0], expectedUpdatedAt: -1 }],
      }),
    },
    {
      name: "nonfinite document snapshot timestamp",
      phase: "explorer",
      buildAttempt: () => ({
        ...attempt,
        documentAssociations: [{ ...attempt.documentAssociations[0], expectedUpdatedAt: Number.POSITIVE_INFINITY }],
      }),
    },
    {
      name: "negative delete snapshot timestamp",
      phase: "explorer",
      buildAttempt: () => ({
        ...attempt,
        operationDescriptors: [{ path: "content/a.mdx", action: "delete" }, attempt.operationDescriptors[1]],
        documentAssociations: [],
        deleteAssociations: [{ opId: "op_1", documentId: "doc_1", expectedUpdatedAt: -1 }],
      }),
      pathOutcomes: [
        { path: "content/a.mdx", disposition: "finalize" },
        { path: "public/pic.png", disposition: "restore" },
      ],
    },
  ])("rejects $name before any $phase cleanup write", async ({ phase, buildAttempt, pathOutcomes }) => {
    const corruptCleanup = cleanupRow({ phase, pathOutcomes: pathOutcomes ?? outcomes })
    const cleanupAttempt = { ...buildAttempt(), status: "cleanup_pending", cleanupId: "cleanup_1" }
    const ctx = createCtx([
      { ...project },
      { ...lane },
      cleanupAttempt,
      corruptCleanup,
      {
        _id: "op_1",
        projectId: "project_1",
        repoPath: "content/a.mdx",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: Number.NaN,
      },
      {
        _id: "media_1",
        projectId: "project_1",
        repoPath: "public/pic.png",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        convexStorageId: "storage_1",
        updatedAt: -1,
      },
    ])

    await expect((continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })).rejects.toThrow(
      /snapshot|revision|version|association/i,
    )
    expectNoCleanupWrites(ctx, corruptCleanup)
  })

  it("finalizes exact pending associations for a merged committing attempt without fabricating its commit SHA", async () => {
    const noCommitAttempt = {
      ...attempt,
      status: "cleanup_pending",
      commitSha: undefined,
      operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
      operationPaths: ["content/a.mdx"],
      mediaAssociations: [],
      cleanupId: "cleanup_1",
    }
    const ctx = createCtx([
      { ...project },
      { ...lane, mergeCommitSha: "3".repeat(40), mergeVerificationState: "pending" },
      noCommitAttempt,
      cleanupRow({
        pathOutcomes: [{ path: "content/a.mdx", disposition: "finalize", finalBlobSha: "b".repeat(40) }],
        authoritySha: "3".repeat(40),
      }),
      {
        _id: "op_1",
        projectId: "project_1",
        filePath: "a.mdx",
        repoPath: "content/a.mdx",
        opType: "update",
        status: "pending",
        updatedAt: 10,
      },
      {
        _id: "doc_1",
        projectId: "project_1",
        filePath: "a.mdx",
        contentVersion: 3,
        updatedAt: 10,
        status: "draft",
      },
    ])

    for (let pass = 0; pass < 4; pass += 1) {
      await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })
    }

    expect(ctx.db.delete).toHaveBeenCalledWith("op_1")
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "doc_1",
      expect.objectContaining({
        status: "published",
        githubSha: "b".repeat(40),
        publishedProvenance: {
          authorityKind: "base",
          authorityBranch: "main",
          commitSha: "3".repeat(40),
          contentRevision: "e".repeat(64),
          publishedContentVersion: 3,
          publishedUpdatedAt: 10,
        },
      }),
    )
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "attempt_1",
      expect.objectContaining({ commitSha: expect.any(String) }),
    )
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ mergeVerificationState: "complete" }))
  })

  it("replaces existing lane provenance with the exact verified base merge authority", async () => {
    const mergeSha = "3".repeat(40)
    const laneCommitSha = "1".repeat(40)
    const ctx = createCtx([
      { ...project },
      { ...lane, mergeCommitSha: mergeSha, mergeVerificationState: "pending" },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        commitSha: laneCommitSha,
        explorerAssociations: [],
        mediaAssociations: [],
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
      },
      cleanupRow({
        phase: "documents",
        authoritySha: mergeSha,
        pathOutcomes: [{ path: "content/a.mdx", disposition: "finalize", finalBlobSha: "b".repeat(40) }],
      }),
      {
        _id: "doc_1",
        projectId: "project_1",
        filePath: "a.mdx",
        contentVersion: 3,
        updatedAt: 10,
        status: "draft",
        publishedProvenance: {
          authorityKind: "lane",
          authorityBranch: "repopress/start",
          publishBranchId: "lane_1",
          publishAttemptId: "attempt_1",
          commitSha: laneCommitSha,
          contentRevision: "e".repeat(64),
          publishedContentVersion: 3,
          publishedUpdatedAt: 10,
        },
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "doc_1",
      expect.objectContaining({
        githubSha: "b".repeat(40),
        publishedProvenance: {
          authorityKind: "base",
          authorityBranch: "main",
          commitSha: mergeSha,
          contentRevision: "e".repeat(64),
          publishedContentVersion: 3,
          publishedUpdatedAt: 10,
        },
      }),
    )
  })

  it("records unobserved squash/rebase finalization only at the verified base authority", async () => {
    const mergeSha = "4".repeat(40)
    const ctx = createCtx([
      { ...project },
      { ...lane, mergeCommitSha: mergeSha, mergeVerificationState: "pending" },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        commitSha: "1".repeat(40),
        explorerAssociations: [],
        mediaAssociations: [],
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
      },
      cleanupRow({
        phase: "documents",
        authoritySha: mergeSha,
        pathOutcomes: [{ path: "content/a.mdx", disposition: "finalize", finalBlobSha: "b".repeat(40) }],
      }),
      {
        _id: "doc_1",
        projectId: "project_1",
        filePath: "a.mdx",
        contentVersion: 3,
        updatedAt: 10,
        status: "draft",
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    const documentPatch = ctx.db.patch.mock.calls.find(([id]: [string]) => id === "doc_1")?.[1]
    expect(documentPatch.publishedProvenance).toEqual({
      authorityKind: "base",
      authorityBranch: "main",
      commitSha: mergeSha,
      contentRevision: "e".repeat(64),
      publishedContentVersion: 3,
      publishedUpdatedAt: 10,
    })
    expect(documentPatch.publishedProvenance).not.toHaveProperty("publishBranchId")
    expect(documentPatch.publishedProvenance).not.toHaveProperty("publishAttemptId")
  })

  it("replays a merged document cleanup without rewriting its base provenance", async () => {
    const mergeSha = "3".repeat(40)
    const cleanup = cleanupRow({
      phase: "documents",
      authoritySha: mergeSha,
      pathOutcomes: [{ path: "content/a.mdx", disposition: "finalize", finalBlobSha: "b".repeat(40) }],
    })
    const cleanupAttempt = {
      ...attempt,
      status: "cleanup_pending",
      cleanupId: "cleanup_1",
      explorerAssociations: [],
      mediaAssociations: [],
      operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
      operationPaths: ["content/a.mdx"],
    }
    const ctx = createCtx([
      { ...project },
      { ...lane, mergeCommitSha: mergeSha, mergeVerificationState: "pending" },
      cleanupAttempt,
      cleanup,
      {
        _id: "doc_1",
        projectId: "project_1",
        filePath: "a.mdx",
        contentVersion: 3,
        updatedAt: 10,
        status: "draft",
        publishedProvenance: {
          authorityKind: "lane",
          authorityBranch: "repopress/start",
          publishBranchId: "lane_1",
          publishAttemptId: "attempt_1",
          commitSha: "1".repeat(40),
          contentRevision: "e".repeat(64),
          publishedContentVersion: 3,
          publishedUpdatedAt: 10,
        },
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })
    const document = ctx._tables.get("documents")[0]
    const expectedBaseProvenance = {
      authorityKind: "base",
      authorityBranch: "main",
      commitSha: mergeSha,
      contentRevision: "e".repeat(64),
      publishedContentVersion: 3,
      publishedUpdatedAt: 10,
    }
    expect(document.publishedProvenance).toEqual(expectedBaseProvenance)

    Object.assign(cleanup, { phase: "documents", cursor: 0, status: "pending" })
    Object.assign(cleanupAttempt, { status: "cleanup_pending" })
    Object.assign(ctx._tables.get("publishBranches")[0], { mergeVerificationState: "pending" })
    ctx.db.patch.mockClear()
    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(document.publishedProvenance).toEqual(expectedBaseProvenance)
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_1", expect.anything())
  })

  it("re-dispatches persisted legacy residue after the final attempt cleanup releases the guard", async () => {
    const ctx = createCtx([
      { ...project },
      {
        ...lane,
        mergeCommitSha: "3".repeat(40),
        mergeVerificationState: "pending",
        laneInvalidationPending: true,
        laneCleanupAction: "finalize_legacy",
      },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        explorerAssociations: [{ opId: "op_1", repoPath: "content/a.mdx", expectedUpdatedAt: 10 }],
        mediaAssociations: [],
        documentAssociations: [],
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
      },
      cleanupRow({
        phase: "documents",
        cursor: 0,
        pathOutcomes: [{ path: "content/a.mdx", disposition: "finalize", finalBlobSha: "b".repeat(40) }],
      }),
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).toHaveBeenCalledWith("attempt_1", expect.objectContaining({ status: "cleaned" }))
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), { id: "lane_1" })
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "lane_1",
      expect.objectContaining({ mergeVerificationState: "complete" }),
    )
  })

  it("finishes exact pending explorer, media, and document snapshots after recordCommit crashed reconciliation", async () => {
    const recordedButUnreconciled = {
      ...attempt,
      status: "cleanup_pending",
      cleanupId: "cleanup_1",
      commitSha: "1".repeat(40),
    }
    const ctx = createCtx([
      { ...project },
      { ...lane, mergeCommitSha: "3".repeat(40), mergeVerificationState: "pending" },
      recordedButUnreconciled,
      cleanupRow({
        pathOutcomes: [
          { path: "content/a.mdx", disposition: "finalize", finalBlobSha: "b".repeat(40) },
          { path: "public/pic.png", disposition: "finalize", finalBlobSha: "c".repeat(40) },
        ],
        authoritySha: "3".repeat(40),
      }),
      {
        _id: "op_1",
        projectId: "project_1",
        filePath: "a.mdx",
        repoPath: "content/a.mdx",
        opType: "update",
        status: "pending",
        updatedAt: 10,
      },
      {
        _id: "media_1",
        projectId: "project_1",
        repoPath: "public/pic.png",
        status: "pending",
        convexStorageId: "storage_1",
        updatedAt: 10,
      },
      {
        _id: "doc_1",
        projectId: "project_1",
        filePath: "a.mdx",
        contentVersion: 3,
        updatedAt: 10,
        status: "draft",
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })
    expect(ctx.db.delete).toHaveBeenCalledWith("op_1")
    expect(ctx.db.patch).not.toHaveBeenCalledWith("attempt_1", expect.objectContaining({ status: "cleaned" }))

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })
    expect(ctx.storage.delete).toHaveBeenCalledWith("storage_1")
    expect(ctx.db.delete).toHaveBeenCalledWith("media_1")
    expect(ctx.db.patch).not.toHaveBeenCalledWith("attempt_1", expect.objectContaining({ status: "cleaned" }))

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "doc_1",
      expect.objectContaining({
        status: "published",
        githubSha: "b".repeat(40),
        publishedProvenance: {
          authorityKind: "base",
          authorityBranch: "main",
          commitSha: "3".repeat(40),
          contentRevision: "e".repeat(64),
          publishedContentVersion: 3,
          publishedUpdatedAt: 10,
        },
      }),
    )
    expect(ctx.db.patch).toHaveBeenCalledWith("attempt_1", expect.objectContaining({ status: "cleaned" }))
  })

  it("completes closed-lane verification after the final attempt-scoped restore cleanup", async () => {
    const ctx = createCtx([
      { ...project },
      {
        ...lane,
        status: "closed",
        closeVerificationState: "pending",
      },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        explorerAssociations: [{ opId: "op_1", repoPath: "content/a.mdx", expectedUpdatedAt: 10 }],
        mediaAssociations: [],
        documentAssociations: [],
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
      },
      cleanupRow({
        phase: "documents",
        cursor: 0,
        pathOutcomes: [{ path: "content/a.mdx", disposition: "restore" }],
        authoritySha: undefined,
      }),
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).toHaveBeenCalledWith("attempt_1", expect.objectContaining({ status: "cleaned" }))
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ closeVerificationState: "complete" }))
  })

  it("does not complete closed-lane verification while an older reused-lane attempt remains", async () => {
    const ctx = createCtx([
      { ...project },
      {
        ...lane,
        status: "closed",
        closeVerificationState: "pending",
      },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        explorerAssociations: [{ opId: "op_1", repoPath: "content/a.mdx", expectedUpdatedAt: 10 }],
        mediaAssociations: [],
        documentAssociations: [],
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
        createdAt: 2,
      },
      {
        ...attempt,
        _id: "attempt_older",
        status: "reconciled",
        createdAt: 1,
      },
      cleanupRow({
        phase: "documents",
        cursor: 0,
        pathOutcomes: [{ path: "content/a.mdx", disposition: "restore" }],
        authoritySha: undefined,
      }),
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "lane_1",
      expect.objectContaining({ closeVerificationState: "complete" }),
    )
  })

  it("clears an unchanged deleted document only after the merge tree verifies the deletion", async () => {
    const deleteAttempt = {
      ...attempt,
      status: "cleanup_pending",
      cleanupId: "cleanup_1",
      operationDescriptors: [{ path: "content/a.mdx", action: "delete" }],
      operationPaths: ["content/a.mdx"],
      mediaAssociations: [],
      documentAssociations: [],
      deleteAssociations: [{ opId: "op_1", documentId: "doc_1", expectedUpdatedAt: 10 }],
    }
    const ctx = createCtx([
      { ...project },
      { ...lane, mergeCommitSha: "3".repeat(40), mergeVerificationState: "pending" },
      deleteAttempt,
      cleanupRow({ pathOutcomes: [{ path: "content/a.mdx", disposition: "finalize" }] }),
      {
        _id: "op_1",
        projectId: "project_1",
        filePath: "a.mdx",
        pathRepresentation: "content_relative_v1",
        repoPath: "content/a.mdx",
        opType: "delete",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 20,
      },
      {
        _id: "doc_1",
        projectId: "project_1",
        filePath: "a.mdx",
        pathRepresentation: "content_relative_v1",
        status: "draft",
        body: "recoverable until merge",
        frontmatter: { title: "A" },
        contentVersion: 3,
        updatedAt: 10,
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "doc_1",
      expect.objectContaining({ body: undefined, frontmatter: undefined, contentVersion: 4 }),
    )
    expect(ctx.db.delete).toHaveBeenCalledWith("op_1")
  })

  it("restores a closed-lane delete without clearing its recoverable document", async () => {
    const deleteAttempt = {
      ...attempt,
      status: "cleanup_pending",
      cleanupId: "cleanup_1",
      operationDescriptors: [{ path: "content/a.mdx", action: "delete" }],
      operationPaths: ["content/a.mdx"],
      mediaAssociations: [],
      documentAssociations: [],
      deleteAssociations: [{ opId: "op_1", documentId: "doc_1", expectedUpdatedAt: 10 }],
    }
    const ctx = createCtx([
      { ...project },
      { ...lane, status: "closed" },
      deleteAttempt,
      cleanupRow({ authoritySha: undefined, pathOutcomes: [{ path: "content/a.mdx", disposition: "restore" }] }),
      {
        _id: "op_1",
        projectId: "project_1",
        filePath: "a.mdx",
        pathRepresentation: "content_relative_v1",
        repoPath: "content/a.mdx",
        opType: "delete",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 20,
      },
      {
        _id: "doc_1",
        projectId: "project_1",
        filePath: "a.mdx",
        pathRepresentation: "content_relative_v1",
        status: "draft",
        body: "must survive",
        frontmatter: { title: "A" },
        contentVersion: 3,
        updatedAt: 10,
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).toHaveBeenCalledWith("op_1", expect.objectContaining({ status: "pending" }))
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "doc_1",
      expect.objectContaining({ body: undefined, frontmatter: undefined }),
    )
  })

  it("persists and executes discard without restoring stale intent", async () => {
    const ctx = createCtx([
      { ...project },
      { ...lane, mergeCommitSha: "3".repeat(40), mergeVerificationState: "pending" },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
        mediaAssociations: [],
      },
      cleanupRow({ pathOutcomes: [{ path: "content/a.mdx", disposition: "discard" }] }),
      {
        _id: "op_1",
        projectId: "project_1",
        filePath: "a.mdx",
        repoPath: "content/a.mdx",
        opType: "update",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 10,
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.delete).toHaveBeenCalledWith("op_1")
    expect(ctx.db.patch).not.toHaveBeenCalledWith("op_1", expect.objectContaining({ status: "pending" }))
  })

  it.each([
    ["blob", "c".repeat(40)],
    ["absent", undefined],
  ] as const)("applies the newer merged attempt's %s baseline while discarding older provenance", async (state, finalBlobSha) => {
    const ctx = createCtx([
      { ...project },
      { ...lane },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        opIds: [],
        explorerAssociations: [],
        mediaAssociations: [],
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
      },
      cleanupRow({
        phase: "documents",
        pathOutcomes: [{ path: "content/a.mdx", disposition: "discard", ...(finalBlobSha ? { finalBlobSha } : {}) }],
      }),
      {
        _id: "doc_1",
        projectId: "project_1",
        updatedAt: 10,
        contentVersion: 3,
        githubSha: "b".repeat(40),
        gitBaselineState: "blob",
        publishedProvenance: {
          authorityKind: "lane",
          authorityBranch: "repopress/start",
          publishBranchId: "lane_1",
          publishAttemptId: "attempt_1",
          commitSha: "1".repeat(40),
          contentRevision: "e".repeat(64),
          publishedContentVersion: 3,
          publishedUpdatedAt: 10,
        },
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).toHaveBeenCalledWith("doc_1", {
      githubSha: finalBlobSha,
      gitBaselineState: state,
      publishedProvenance: undefined,
    })
  })

  it("processes mixed explorer outcomes by exact attempt ownership and isolates a reused lane", async () => {
    const attemptWithOps = {
      ...attempt,
      status: "cleanup_pending",
      cleanupId: "cleanup_1",
      explorerAssociations: [
        { opId: "op_finalize", repoPath: "content/a.mdx", expectedUpdatedAt: 10 },
        { opId: "op_restore", repoPath: "content/b.mdx", expectedUpdatedAt: 10 },
        { opId: "op_other_attempt", repoPath: "content/c.mdx", expectedUpdatedAt: 10 },
      ],
      operationDescriptors: ["a", "b", "c"].map((name) => ({
        path: `content/${name}.mdx`,
        action: "update",
        expectedBlobSha: "4".repeat(40),
      })),
      operationPaths: ["content/a.mdx", "content/b.mdx", "content/c.mdx"],
      mediaAssociations: [],
      documentAssociations: [],
    }
    const mixedOutcomes = [
      { path: "content/a.mdx", disposition: "finalize", finalBlobSha: "4".repeat(40) },
      { path: "content/b.mdx", disposition: "restore" },
      { path: "content/c.mdx", disposition: "restore" },
    ]
    const rows: Row[] = [
      { ...project },
      { ...lane },
      attemptWithOps,
      cleanupRow({ pathOutcomes: mixedOutcomes }),
      {
        _id: "op_finalize",
        projectId: "project_1",
        repoPath: "content/a.mdx",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 10,
      },
      {
        _id: "op_restore",
        projectId: "project_1",
        repoPath: "content/b.mdx",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 10,
      },
      {
        _id: "op_other_attempt",
        projectId: "project_1",
        repoPath: "content/c.mdx",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_2",
        commitSha: "9".repeat(40),
        updatedAt: 10,
      },
    ]
    const ctx = createCtx(rows)

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.delete).toHaveBeenCalledWith("op_finalize")
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "op_restore",
      expect.objectContaining({ status: "pending", publishAttemptId: undefined, publishBranchId: undefined }),
    )
    expect(ctx.db.patch).not.toHaveBeenCalledWith("op_other_attempt", expect.anything())
    expect(ctx.db.delete).not.toHaveBeenCalledWith("op_other_attempt")
  })

  it("does not restore an older explorer op over a newer indexed pending intent", async () => {
    const ctx = createCtx([
      { ...project },
      { ...lane },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
        mediaAssociations: [],
        documentAssociations: [],
      },
      cleanupRow({ pathOutcomes: [{ path: "content/a.mdx", disposition: "restore" }] }),
      {
        _id: "op_1",
        projectId: "project_1",
        repoPath: "content/a.mdx",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 10,
      },
      {
        _id: "op_newer",
        projectId: "project_1",
        repoPath: "content/a.mdx",
        status: "pending",
        updatedAt: 20,
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.delete).toHaveBeenCalledWith("op_1")
    expect(ctx.db.patch).not.toHaveBeenCalledWith("op_1", expect.objectContaining({ status: "pending" }))
  })

  it("restores media without deleting bytes and leaves a retryable tombstone when finalize deletion fails", async () => {
    const mediaAttempt = {
      ...attempt,
      status: "cleanup_pending",
      cleanupId: "cleanup_1",
      explorerAssociations: [],
      mediaAssociations: [
        { mediaOpId: "media_restore", repoPath: "public/keep.png", expectedUpdatedAt: 10 },
        { mediaOpId: "media_finalize", repoPath: "public/drop.png", expectedUpdatedAt: 10 },
      ],
      operationDescriptors: ["keep", "drop"].map((name) => ({
        path: `public/${name}.png`,
        action: "create",
        expectedBlobSha: "5".repeat(40),
      })),
      operationPaths: ["public/keep.png", "public/drop.png"],
      documentAssociations: [],
    }
    const ctx = createCtx([
      { ...project },
      { ...lane },
      mediaAttempt,
      cleanupRow({
        phase: "media",
        pathOutcomes: [
          { path: "public/keep.png", disposition: "restore" },
          { path: "public/drop.png", disposition: "finalize", finalBlobSha: "5".repeat(40) },
        ],
      }),
      {
        _id: "media_restore",
        projectId: "project_1",
        repoPath: "public/keep.png",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        convexStorageId: "storage_keep",
        updatedAt: 10,
      },
      {
        _id: "media_finalize",
        projectId: "project_1",
        repoPath: "public/drop.png",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        convexStorageId: "storage_fail",
        updatedAt: 10,
      },
    ])
    ctx.storage.delete.mockRejectedValueOnce(new Error("unavailable"))

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.storage.delete).not.toHaveBeenCalledWith("storage_keep")
    expect(ctx.db.patch).toHaveBeenCalledWith("media_restore", expect.objectContaining({ status: "pending" }))
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "media_finalize",
      expect.objectContaining({ status: "failed", publishAttemptId: undefined, publishBranchId: undefined }),
    )
  })

  it.each([
    "finalize",
    "restore",
  ] as const)("uses canonical Git identity to %s leading-slash media while leaving an excluded redundant document alone", async (disposition) => {
    const finalBlobSha = disposition === "finalize" ? "c".repeat(40) : undefined
    const ctx = createCtx([
      { ...project },
      { ...lane },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        operationDescriptors: [{ path: "public/pic.png", action: "create", expectedBlobSha: "c".repeat(40) }],
        operationPaths: ["public/pic.png"],
        explorerAssociations: [],
        mediaAssociations: [{ mediaOpId: "media_1", repoPath: "public/pic.png", expectedUpdatedAt: 10 }],
        // A byte-identical dirty document is deliberately not owned by
        // this mutating attempt and therefore has no cleanup association.
        documentAssociations: [],
      },
      cleanupRow({
        phase: "media",
        pathOutcomes: [{ path: "public/pic.png", disposition, ...(finalBlobSha ? { finalBlobSha } : {}) }],
      }),
      {
        _id: "media_1",
        projectId: "project_1",
        repoPath: "/public/pic.png",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        convexStorageId: "storage_1",
        updatedAt: 10,
      },
      {
        _id: "doc_redundant",
        projectId: "project_1",
        contentVersion: 4,
        publishedProvenance: undefined,
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    if (disposition === "finalize") {
      expect(ctx.storage.delete).toHaveBeenCalledWith("storage_1")
      expect(ctx.db.delete).toHaveBeenCalledWith("media_1")
    } else {
      expect(ctx.db.patch).toHaveBeenCalledWith("media_1", expect.objectContaining({ status: "pending" }))
      expect(ctx.storage.delete).not.toHaveBeenCalled()
    }
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_redundant", expect.anything())
  })

  it("fails closed without advancing when an association has no persisted cleanup outcome", async () => {
    const ctx = createCtx([
      { ...project },
      { ...lane },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
        mediaAssociations: [],
        documentAssociations: [],
      },
      cleanupRow({ pathOutcomes: [{ path: "public/pic.png", disposition: "restore" }] }),
      {
        _id: "op_1",
        projectId: "project_1",
        repoPath: "content/a.mdx",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 10,
      },
    ])

    await expect((continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })).rejects.toThrow(
      /association.*outcome|outcomes must exactly/i,
    )
    expect(ctx.db.patch).not.toHaveBeenCalledWith("cleanup_1", expect.anything())
    expect(ctx.db.patch).not.toHaveBeenCalledWith("attempt_1", expect.anything())
  })

  it("publishes unchanged documents and resets restored documents to the verified Git baseline", async () => {
    const docAttempt = {
      ...attempt,
      status: "cleanup_pending",
      cleanupId: "cleanup_1",
      explorerAssociations: [],
      mediaAssociations: [],
      documentAssociations: [
        { documentId: "doc_finalize", repoPath: "content/a.mdx", expectedUpdatedAt: 10, contentVersion: 3 },
        { documentId: "doc_restore", repoPath: "content/b.mdx", expectedUpdatedAt: 10, contentVersion: 3 },
        { documentId: "doc_newer", repoPath: "content/c.mdx", expectedUpdatedAt: 10, contentVersion: 3 },
        { documentId: "doc_other", repoPath: "content/d.mdx", expectedUpdatedAt: 10, contentVersion: 3 },
        { documentId: "doc_unrecorded", repoPath: "content/e.mdx", expectedUpdatedAt: 10, contentVersion: 3 },
      ],
      operationDescriptors: ["a", "b", "c", "d", "e"].map((name) => ({
        path: `content/${name}.mdx`,
        action: "update",
        expectedBlobSha: "6".repeat(40),
      })),
      operationPaths: ["content/a.mdx", "content/b.mdx", "content/c.mdx", "content/d.mdx", "content/e.mdx"],
    }
    const provenance = {
      publishBranchId: "lane_1",
      publishAttemptId: "attempt_1",
      commitSha: "1".repeat(40),
      publishedUpdatedAt: 10,
      publishedContentVersion: 3,
    }
    const ctx = createCtx([
      { ...project },
      { ...lane, mergeCommitSha: "3".repeat(40) },
      docAttempt,
      cleanupRow({
        phase: "documents",
        pathOutcomes: [
          { path: "content/a.mdx", disposition: "finalize", finalBlobSha: "6".repeat(40) },
          { path: "content/b.mdx", disposition: "restore", finalBlobSha: "7".repeat(40) },
          { path: "content/c.mdx", disposition: "restore" },
          { path: "content/d.mdx", disposition: "restore" },
          { path: "content/e.mdx", disposition: "restore" },
        ],
      }),
      {
        _id: "doc_finalize",
        projectId: "project_1",
        status: "draft",
        contentVersion: 3,
        publishedProvenance: provenance,
      },
      {
        _id: "doc_restore",
        projectId: "project_1",
        status: "draft",
        contentVersion: 3,
        githubSha: "1".repeat(40),
        publishedProvenance: provenance,
      },
      {
        _id: "doc_newer",
        projectId: "project_1",
        status: "draft",
        contentVersion: 4,
        githubSha: "1".repeat(40),
        publishedProvenance: provenance,
      },
      {
        _id: "doc_other",
        projectId: "project_1",
        status: "draft",
        contentVersion: 3,
        publishedProvenance: { ...provenance, publishAttemptId: "attempt_2" },
      },
      {
        _id: "doc_unrecorded",
        projectId: "project_1",
        status: "draft",
        updatedAt: 10,
        contentVersion: 3,
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "doc_finalize",
      expect.objectContaining({
        status: "published",
        githubSha: "6".repeat(40),
        publishedProvenance: expect.objectContaining({
          authorityKind: "base",
          authorityBranch: "main",
          commitSha: "3".repeat(40),
        }),
      }),
    )
    expect(ctx.db.patch).toHaveBeenCalledWith("doc_restore", {
      githubSha: "7".repeat(40),
      gitBaselineState: "blob",
      publishedProvenance: undefined,
    })
    expect(ctx.db.patch).toHaveBeenCalledWith("doc_newer", {
      githubSha: undefined,
      gitBaselineState: "absent",
      publishedProvenance: undefined,
    })
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_other", expect.anything())
    expect(ctx.db.patch).toHaveBeenCalledWith("doc_unrecorded", {
      githubSha: undefined,
      gitBaselineState: "absent",
    })
  })

  it.each([
    ["wrong lane", { publishBranchId: "lane_other" }],
    ["wrong commit", { commitSha: "9".repeat(40) }],
    ["wrong status", { status: "pending" }],
  ])("does not mutate an explorer row with the right attempt id but %s", async (_label, rowOverride) => {
    const ctx = createCtx([
      { ...project },
      { ...lane },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
        mediaAssociations: [],
        documentAssociations: [],
      },
      cleanupRow({ pathOutcomes: [{ path: "content/a.mdx", disposition: "restore" }] }),
      {
        _id: "op_1",
        projectId: "project_1",
        repoPath: "content/a.mdx",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 10,
        ...rowOverride,
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).not.toHaveBeenCalledWith("op_1", expect.anything())
    expect(ctx.db.delete).not.toHaveBeenCalledWith("op_1")
  })

  it("fails closed without advancing when an owned explorer row path differs from its association", async () => {
    const ctx = createCtx([
      { ...project },
      { ...lane },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
        mediaAssociations: [],
        documentAssociations: [],
      },
      cleanupRow({ pathOutcomes: [{ path: "content/a.mdx", disposition: "restore" }] }),
      {
        _id: "op_1",
        projectId: "project_1",
        repoPath: "content/other.mdx",
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 10,
      },
    ])

    await expect((continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })).rejects.toThrow(
      /row path.*association/i,
    )
    expect(ctx.db.patch).not.toHaveBeenCalledWith("cleanup_1", expect.anything())
    expect(ctx.db.patch).not.toHaveBeenCalledWith("attempt_1", expect.anything())
  })

  it("does not clear document provenance whose persisted snapshot identity differs", async () => {
    const ctx = createCtx([
      { ...project },
      { ...lane },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        explorerAssociations: [],
        mediaAssociations: [],
        operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
        operationPaths: ["content/a.mdx"],
      },
      cleanupRow({ phase: "documents", pathOutcomes: [{ path: "content/a.mdx", disposition: "restore" }] }),
      {
        _id: "doc_1",
        projectId: "project_1",
        contentVersion: 3,
        publishedProvenance: {
          publishBranchId: "lane_1",
          publishAttemptId: "attempt_1",
          commitSha: "1".repeat(40),
          publishedUpdatedAt: 10,
          publishedContentVersion: 3,
          contentRevision: "f".repeat(64),
        },
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_1", expect.anything())
  })

  it.each([101, 500])("processes %i exact explorer rows in <=25-row passes without collect", async (count) => {
    const associations = Array.from({ length: count }, (_value, index) => ({
      opId: `op_${index}`,
      repoPath: `content/${index}.mdx`,
      expectedUpdatedAt: 10,
    }))
    const pathOutcomes = associations.map(({ repoPath: path }) => ({
      path,
      disposition: "finalize" as const,
      finalBlobSha: "4".repeat(40),
    }))
    const rows: Row[] = [
      { ...project },
      { ...lane },
      {
        ...attempt,
        status: "cleanup_pending",
        cleanupId: "cleanup_1",
        explorerAssociations: associations,
        operationDescriptors: associations.map(({ repoPath: path }) => ({
          path,
          action: "update",
          expectedBlobSha: "4".repeat(40),
        })),
        operationPaths: associations.map(({ repoPath }) => repoPath),
        mediaAssociations: [],
        documentAssociations: [],
      },
      cleanupRow({ pathOutcomes }),
      ...associations.map((association) => ({
        _id: association.opId,
        projectId: "project_1",
        repoPath: association.repoPath,
        status: "committed",
        publishBranchId: "lane_1",
        publishAttemptId: "attempt_1",
        commitSha: "1".repeat(40),
        updatedAt: 10,
      })),
    ]
    const ctx = createCtx(rows)
    let passes = 0
    while ((ctx._tables.get("publishAttemptCleanups")?.[0] as Row).status !== "complete") {
      const targetMutationsBefore =
        ctx.db.delete.mock.calls.filter(([id]: [string]) => id.startsWith("op_")).length +
        ctx.db.patch.mock.calls.filter(([id]: [string]) => id.startsWith("op_")).length
      await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })
      const targetMutationsAfter =
        ctx.db.delete.mock.calls.filter(([id]: [string]) => id.startsWith("op_")).length +
        ctx.db.patch.mock.calls.filter(([id]: [string]) => id.startsWith("op_")).length
      expect(targetMutationsAfter - targetMutationsBefore).toBeLessThanOrEqual(CLEANUP_BATCH_SIZE)
      passes += 1
      expect(passes).toBeLessThan(100)
    }

    expect(ctx._deleted.size).toBe(count)
    expect((ctx._tables.get("publishAttempts")?.[0] as Row).status).toBe("cleaned")
  })
})
