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

import { CLEANUP_BATCH_SIZE } from "@/convex/lib/publishAttemptCleanup"
import { continueCleanup } from "@/convex/publishAttemptCleanups"
import { getActiveForProject, resolveAndEnqueueCleanup, supersedeClosedPending } from "@/convex/publishAttempts"

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
    order: vi.fn((_direction: string) => chain([...rows].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)))),
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

  it("atomically installs an immutable cleanup plan, keeps the guard active, and schedules it", async () => {
    const ctx = createCtx([{ ...project }, { ...lane }, { ...attempt }])

    const result = await (resolveAndEnqueueCleanup as any).handler(ctx, {
      id: "attempt_1",
      authoritySha: "3".repeat(40),
      pathOutcomes: outcomes,
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
        createdAt: 20,
        updatedAt: 20,
      },
    ])

    await (resolveAndEnqueueCleanup as any).handler(ctx, {
      id: "attempt_1",
      authoritySha: "3".repeat(40),
      pathOutcomes: [{ path: "content/a.mdx", disposition: "finalize", finalBlobSha: "b".repeat(40) }],
      arbitrateMergedPaths: true,
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
        arbitrateMergedPaths: true,
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
      (supersedeClosedPending as any).handler(ctx, { id: "attempt_1", userId: "user_owner" }),
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
      (supersedeClosedPending as any).handler(raced, { id: "attempt_1", userId: "user_owner" }),
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
        userId: "user_owner",
      }),
    ).rejects.toThrow(/conflicting cleanup plan/i)
  })

  it("rejects outcomes outside the attempt and finalize plans without an authority", async () => {
    const ctx = createCtx([{ ...project }, { ...lane }, { ...attempt }])
    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        pathOutcomes: outcomes,
        userId: "user_owner",
      }),
    ).rejects.toThrow(/authority/i)
    await expect(
      (resolveAndEnqueueCleanup as any).handler(ctx, {
        id: "attempt_1",
        authoritySha: "3".repeat(40),
        pathOutcomes: [...outcomes, { path: "content/not-in-plan.mdx", disposition: "restore" }],
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
        userId: "user_owner",
      }),
    ).rejects.toThrow(/association.*descriptor/i)
    expect(ctx.db.insert).not.toHaveBeenCalled()
  })
})

describe("bounded attempt-scoped cleanup continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue({ _id: "user_owner" })
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
        publishedProvenance: expect.objectContaining({
          publishAttemptId: "attempt_1",
          commitSha: "3".repeat(40),
          publishedContentVersion: 3,
        }),
      }),
    )
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "attempt_1",
      expect.objectContaining({ commitSha: expect.any(String) }),
    )
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ mergeVerificationState: "complete" }))
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
        explorerAssociations: [],
        mediaAssociations: [],
        documentAssociations: [],
        operationDescriptors: [],
        operationPaths: [],
      },
      cleanupRow({ phase: "documents", cursor: 0, pathOutcomes: [] }),
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).toHaveBeenCalledWith("attempt_1", expect.objectContaining({ status: "cleaned" }))
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), { id: "lane_1" })
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "lane_1",
      expect.objectContaining({ mergeVerificationState: "complete" }),
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
    const finalBlobSha = disposition === "finalize" ? "8".repeat(40) : undefined
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
      /association.*outcome/i,
    )
    expect(ctx.db.patch).not.toHaveBeenCalledWith("cleanup_1", expect.anything())
    expect(ctx.db.patch).not.toHaveBeenCalledWith("attempt_1", expect.anything())
  })

  it("publishes only unchanged documents but clears owned provenance from edited restores", async () => {
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
      ],
      operationDescriptors: ["a", "b", "c", "d"].map((name) => ({
        path: `content/${name}.mdx`,
        action: "update",
        expectedBlobSha: "6".repeat(40),
      })),
      operationPaths: ["content/a.mdx", "content/b.mdx", "content/c.mdx", "content/d.mdx"],
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
      { ...lane },
      docAttempt,
      cleanupRow({
        phase: "documents",
        pathOutcomes: [
          { path: "content/a.mdx", disposition: "finalize", finalBlobSha: "6".repeat(40) },
          { path: "content/b.mdx", disposition: "restore" },
          { path: "content/c.mdx", disposition: "restore" },
          { path: "content/d.mdx", disposition: "restore" },
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
        publishedProvenance: provenance,
      },
      {
        _id: "doc_newer",
        projectId: "project_1",
        status: "draft",
        contentVersion: 4,
        publishedProvenance: provenance,
      },
      {
        _id: "doc_other",
        projectId: "project_1",
        status: "draft",
        contentVersion: 3,
        publishedProvenance: { ...provenance, publishAttemptId: "attempt_2" },
      },
    ])

    await (continueCleanup as any).handler(ctx, { cleanupId: "cleanup_1" })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "doc_finalize",
      expect.objectContaining({ status: "published", githubSha: "6".repeat(40) }),
    )
    expect(ctx.db.patch).toHaveBeenCalledWith("doc_restore", { publishedProvenance: undefined })
    expect(ctx.db.patch).toHaveBeenCalledWith("doc_newer", { publishedProvenance: undefined })
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_other", expect.anything())
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
    const pathOutcomes = associations.map(({ repoPath: path }) => ({ path, disposition: "finalize" as const }))
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
