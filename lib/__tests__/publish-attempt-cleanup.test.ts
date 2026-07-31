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
import { resolveAndEnqueueCleanup } from "@/convex/publishAttempts"

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
    const id = table === "publishAttemptCleanups" ? "cleanup_1" : `${table}_${(tables.get(table) ?? []).length + 1}`
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
})

describe("bounded attempt-scoped cleanup continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue({ _id: "user_owner" })
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
      { ...attempt, status: "cleanup_pending", cleanupId: "cleanup_1" },
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

  it("publishes or clears only unchanged documents whose provenance belongs to the attempt", async () => {
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
          { path: "content/c.mdx", disposition: "finalize", finalBlobSha: "7".repeat(40) },
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
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_newer", expect.anything())
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_other", expect.anything())
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
