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

import { handlePRClosed, handlePRMerged, recordVerifiedPullRequestState } from "@/convex/githubWebhook"
import { invalidateClosedLaneSync, LANE_CLEANUP_BATCH } from "@/convex/lib/laneInvalidation"
import { finalizeMergedLaneSync } from "@/convex/lib/laneMerge"
import { cleanupStaleUploads } from "@/convex/mediaOps"
import * as publishBranchesModule from "@/convex/publishBranches"
import { finishLaneCleanup, getStatusSyncCandidateForProject } from "@/convex/publishBranches"
import { mintProjectAccessToken, mintServerQueryToken } from "@/lib/project-access-token"

const project = {
  _id: "project_1",
  userId: "user_owner",
  repoOwner: "acme",
  repoName: "docs-site",
  contentRoot: "content",
}

function laneDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: "lane_1",
    projectId: "project_1",
    repoOwner: "acme",
    repoName: "docs-site",
    repoOwnerKey: "acme",
    repoNameKey: "docs-site",
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
 * eq("status", ...), eq("publishBranchId", ...), and even nested paths like
 * eq("publishedProvenance.publishBranchId", ...) select rows the way the
 * real indexes would.
 */
function createLaneCtx({
  activePublishAttempt = null,
  explorerOps = [],
  mediaOps = [],
  documents = [],
  publishBranches = [],
  failingStorageIds = [],
}: {
  activePublishAttempt?: Record<string, unknown> | null
  explorerOps?: Array<Record<string, unknown>>
  mediaOps?: Array<Record<string, unknown>>
  documents?: Array<Record<string, unknown>>
  publishBranches?: Array<Record<string, unknown>>
  failingStorageIds?: string[]
} = {}) {
  const rowsById = new Map<string, Record<string, unknown>>()
  for (const row of [project, ...explorerOps, ...mediaOps, ...documents, ...publishBranches]) {
    rowsById.set(String(row._id), row)
  }
  const deletedIds = new Set<string>()
  const cleanupTrace = { indexes: [] as Array<{ table: string; name: string }>, chainedFilters: 0 }

  const captureIndexCriteria = (cb?: (q: unknown) => unknown) => {
    const equalities: Record<string, unknown> = {}
    const ranges: Array<{ operator: "lt" | "lte"; field: string; value: number }> = []
    const recorder: Record<string, unknown> = {
      eq: (field: string, value: unknown) => {
        equalities[field] = value
        return recorder
      },
      lt: (field: string, value: number) => {
        ranges.push({ operator: "lt", field, value })
        return recorder
      },
      lte: (field: string, value: number) => {
        ranges.push({ operator: "lte", field, value })
        return recorder
      },
    }
    cb?.(recorder)
    return { equalities, ranges }
  }

  const valueAtPath = (row: Record<string, unknown>, field: string) =>
    field.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], row)

  const rowsFor = (
    table: string,
    criteria: {
      equalities: Record<string, unknown>
      ranges: Array<{ operator: "lt" | "lte"; field: string; value: number }>
    },
  ) => {
    if (table === "publishAttempts") {
      return activePublishAttempt &&
        Object.entries(criteria.equalities).every(
          ([field, value]) => valueAtPath(activePublishAttempt, field) === value,
        )
        ? [activePublishAttempt]
        : []
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
    return source.filter(
      (row) =>
        !deletedIds.has(String(row._id)) &&
        Object.entries(criteria.equalities).every(([field, value]) => valueAtPath(row, field) === value) &&
        criteria.ranges.every(({ operator, field, value }) => {
          const actual = valueAtPath(row, field)
          // Convex indexes optional fields as undefined before numbers, so
          // legacy rows without the new eligibility timestamp enter the
          // bounded migration batch.
          if (actual === undefined) return true
          if (typeof actual !== "number") return false
          return operator === "lt" ? actual < value : actual <= value
        }),
    )
  }

  const chain = (rows: Array<Record<string, unknown>>, indexName?: string): any => ({
    first: vi.fn().mockImplementation(async () => rows[0] ?? null),
    order: vi.fn().mockImplementation((direction: "asc" | "desc") => {
      if (!indexName?.includes("lastStatusCheckedAt")) return chain(rows, indexName)
      const ordered = [...rows].sort(
        (a, b) =>
          ((a.lastStatusCheckedAt as number | undefined) ?? 0) - ((b.lastStatusCheckedAt as number | undefined) ?? 0) ||
          ((a.createdAt as number | undefined) ?? 0) - ((b.createdAt as number | undefined) ?? 0) ||
          String(a._id).localeCompare(String(b._id)),
      )
      return chain(direction === "asc" ? ordered : ordered.reverse(), indexName)
    }),
    collect: vi.fn().mockImplementation(async () => rows),
    take: vi.fn().mockImplementation(async (count: number) => rows.slice(0, count)),
    filter: () => {
      cleanupTrace.chainedFilters += 1
      return chain(rows)
    },
  })

  const patch = vi.fn().mockImplementation(async (id: string, values: Record<string, unknown>) => {
    const row = rowsById.get(String(id))
    if (row) Object.assign(row, values)
  })
  const del = vi.fn().mockImplementation(async (id: string) => {
    deletedIds.add(String(id))
  })
  const storageDelete = vi.fn().mockImplementation(async (storageId: string) => {
    if (failingStorageIds.includes(storageId)) throw new Error("storage backend unavailable")
  })

  // cleanupStaleUploads runs two bare filter().take() scans over mediaOps in
  // order: the stale-pending pass first, then the failed-tombstone pass.
  // Serve rows only to the second so tombstone fixtures never leak into the
  // stale-pending pass.
  let bareMediaFilterCalls = 0
  return {
    db: {
      get: vi.fn().mockImplementation(async (id: string) => rowsById.get(String(id)) ?? null),
      patch,
      delete: del,
      insert: vi.fn().mockResolvedValue("tombstone_1"),
      query: vi.fn((table: string) => ({
        withIndex: (indexName: string, cb?: (q: unknown) => unknown) => {
          cleanupTrace.indexes.push({ table, name: indexName })
          return chain(rowsFor(table, captureIndexCriteria(cb)), indexName)
        },
        filter: () => {
          if (table !== "mediaOps") return chain([])
          bareMediaFilterCalls += 1
          return chain(
            bareMediaFilterCalls === 1 ? [] : rowsFor("mediaOps", { equalities: { status: "failed" }, ranges: [] }),
          )
        },
      })),
    },
    scheduler: { runAfter: vi.fn() },
    storage: { delete: storageDelete },
    cleanupTrace,
  } as any
}

function committedLaneOp(id: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: id,
    projectId: "project_1",
    opType: "create",
    filePath: `guides/${id}.mdx`,
    pathRepresentation: "content_relative_v1",
    status: "committed",
    publishBranchId: "lane_1",
    updatedAt: 10,
    ...overrides,
  }
}

describe("closed-lane synchronization invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    safeGetAuthUserMock.mockResolvedValue(null)
  })

  it("does not expose editor-callable lane lifecycle authority mutations", () => {
    expect((publishBranchesModule as Record<string, unknown>).markMerged).toBeUndefined()
    expect((publishBranchesModule as Record<string, unknown>).markClosed).toBeUndefined()
  })

  it("exposes a separate legacy merged sync candidate without making it reusable", async () => {
    const legacyMerged = laneDoc({ status: "merged", mergeCommitSha: undefined })
    const ctx = createLaneCtx({ publishBranches: [legacyMerged] })

    const candidate = await (getStatusSyncCandidateForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(candidate?._id).toBe("lane_1")
  })

  it("keeps a verified closed lane visible while modern attempt restoration is pending", async () => {
    const closedPending = laneDoc({ status: "closed", closeVerificationState: "pending" })
    const newerActive = laneDoc({ _id: "lane_active", status: "active", prNumber: 43, createdAt: 2, updatedAt: 2 })
    const ctx = createLaneCtx({ publishBranches: [closedPending, newerActive] })

    const candidate = await (getStatusSyncCandidateForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(candidate?._id).toBe("lane_1")
  })

  it("keeps a merged lane visible until immutable-tree verification completes", async () => {
    const mergedPending = laneDoc({
      status: "merged",
      mergeCommitSha: "a".repeat(40),
      mergeVerificationState: "pending",
    })
    const ctx = createLaneCtx({ publishBranches: [mergedPending] })

    const candidate = await (getStatusSyncCandidateForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(candidate?._id).toBe("lane_1")
  })

  it.each([
    ["merged", "mergeVerificationState"],
    ["closed", "closeVerificationState"],
  ] as const)("rotates fairly across pending %s lifecycle lanes", async (status, verificationField) => {
    const justChecked = laneDoc({
      _id: "lane_just_checked",
      status,
      [verificationField]: "pending",
      createdAt: 20,
      updatedAt: 30,
      lastStatusCheckedAt: 30,
    })
    const waiting = laneDoc({
      _id: "lane_waiting",
      status,
      [verificationField]: "pending",
      createdAt: 10,
      updatedAt: 10,
      lastStatusCheckedAt: 10,
    })
    const ctx = createLaneCtx({ publishBranches: [justChecked, waiting] })

    const candidate = await (getStatusSyncCandidateForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(candidate?._id).toBe("lane_waiting")
  })

  it("rotates fairly between pending merged and closed lifecycle lanes", async () => {
    const mergedJustChecked = laneDoc({
      _id: "lane_merged",
      status: "merged",
      mergeVerificationState: "pending",
      mergeCommitSha: "a".repeat(40),
      createdAt: 20,
      updatedAt: 30,
      lastStatusCheckedAt: 30,
    })
    const closedWaiting = laneDoc({
      _id: "lane_closed",
      status: "closed",
      closeVerificationState: "pending",
      createdAt: 10,
      updatedAt: 10,
      lastStatusCheckedAt: 10,
    })
    const ctx = createLaneCtx({ publishBranches: [mergedJustChecked, closedWaiting] })

    const candidate = await (getStatusSyncCandidateForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(candidate?._id).toBe("lane_closed")
  })

  it("selects the least-recently-checked open lane instead of starving an older inactive PR", async () => {
    const active = laneDoc({
      _id: "lane_active",
      status: "active",
      prNumber: 43,
      createdAt: 30,
      updatedAt: 30,
      lastStatusCheckedAt: 30,
    })
    const olderInactive = laneDoc({
      _id: "lane_older_inactive",
      status: "inactive",
      prNumber: 41,
      createdAt: 10,
      updatedAt: 10,
    })
    const newerInactive = laneDoc({
      _id: "lane_newer_inactive",
      status: "inactive",
      prNumber: 42,
      createdAt: 20,
      updatedAt: 20,
      lastStatusCheckedAt: 20,
    })
    const ctx = createLaneCtx({ publishBranches: [active, olderInactive, newerInactive] })

    const candidate = await (getStatusSyncCandidateForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(candidate?._id).toBe("lane_older_inactive")
  })

  it("restores the lane's committed ops, media, and document provenance for republishing", async () => {
    const ctx = createLaneCtx({
      explorerOps: [
        committedLaneOp("op_lane", { filePath: "guides/a.mdx" }),
        committedLaneOp("op_other_lane", { filePath: "guides/other.mdx", publishBranchId: "lane_OTHER" }),
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
      done: true,
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
    // Restoring keeps the staged bytes - nothing is deleted, nothing scheduled.
    expect(ctx.storage.delete).not.toHaveBeenCalled()
    expect(ctx.db.delete).not.toHaveBeenCalled()
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled()
    // Other lanes' rows are untouched.
    expect(ctx.db.patch).not.toHaveBeenCalledWith("op_other_lane", expect.anything())
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_other_lane", expect.anything())
  })

  it("discards committed rows superseded by newer pending intent on the same path", async () => {
    const ctx = createLaneCtx({
      explorerOps: [
        committedLaneOp("op_committed", { filePath: "guides/a.mdx" }),
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
        done: true,
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

  it("keeps a discarded upload as a failed tombstone when its storage delete fails", async () => {
    const ctx = createLaneCtx({
      mediaOps: [
        {
          _id: "media_committed",
          projectId: "project_1",
          repoPath: "/public/x.png",
          status: "committed",
          publishBranchId: "lane_1",
          convexStorageId: "storage_stuck",
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
      failingStorageIds: ["storage_stuck"],
    })

    const result = await invalidateClosedLaneSync(ctx, laneDoc() as any)

    expect(result).toEqual(expect.objectContaining({ discardedMediaOpIds: ["media_committed"] }))
    // The row is NOT deleted - it becomes a durable tombstone that still
    // owns the object, for the nightly cron to retry.
    expect(ctx.db.delete).not.toHaveBeenCalledWith("media_committed")
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "media_committed",
      expect.objectContaining({ status: "failed", publishBranchId: undefined }),
    )
  })

  it("cancels out a create+delete pair on the same path (net zero against the base branch)", async () => {
    const ctx = createLaneCtx({
      explorerOps: [
        committedLaneOp("op_create", { filePath: "guides/a.mdx", opType: "create", updatedAt: 10 }),
        committedLaneOp("op_delete", { filePath: "guides/a.mdx", opType: "delete", updatedAt: 20 }),
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

  it("processes at most one bounded batch per pass and schedules a durable continuation", async () => {
    const manyOps = Array.from({ length: LANE_CLEANUP_BATCH + 5 }, (_v, index) =>
      committedLaneOp(`op_${index}`, { filePath: `guides/file-${index}.mdx` }),
    )
    const lane = laneDoc()
    const ctx = createLaneCtx({ explorerOps: manyOps, publishBranches: [lane] })

    const result = await invalidateClosedLaneSync(ctx, lane as any)

    expect(result).toEqual(expect.objectContaining({ deferred: false, done: false }))
    expect((result as { restoredOpIds: string[] }).restoredOpIds).toHaveLength(LANE_CLEANUP_BATCH)
    // Durable resumability: the flag stays set and a continuation is scheduled.
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ laneInvalidationPending: true }))
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), { id: "lane_1" })

    // The next pass drains the remainder and clears the flag.
    const second = await invalidateClosedLaneSync(ctx, { ...lane, laneInvalidationPending: true } as any)
    expect(second).toEqual(expect.objectContaining({ done: true }))
    expect((second as { restoredOpIds: string[] }).restoredOpIds).toHaveLength(5)
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ laneInvalidationPending: undefined }))
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
      explorerOps: [committedLaneOp("op_lane", { filePath: "guides/a.mdx" })],
      publishBranches: [laneDoc()],
    })

    const result = await invalidateClosedLaneSync(ctx, laneDoc() as any)

    expect(result).toEqual({ deferred: true })
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ laneInvalidationPending: true }))
    expect(ctx.db.patch).not.toHaveBeenCalledWith("op_lane", expect.anything())
  })

  it("server-verified close sync closes the lane and invalidates its synchronization", async () => {
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

    const result = await (recordVerifiedPullRequestState as any).handler(ctx, {
      laneId: "lane_1",
      projectId: "project_1",
      prNumber: 42,
      repoOwner: "acme",
      repoName: "docs-site",
      baseRepoFullName: "acme/docs-site",
      baseBranch: "main",
      headRepoFullName: "acme/docs-site",
      headBranch: "repopress/start",
      state: "closed",
      merged: false,
      serverQueryToken: await mintServerQueryToken(),
    })

    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ status: "closed" }))
    expect(ctx.db.patch).toHaveBeenCalledWith("doc_lane", { publishedProvenance: undefined })
    expect(result).toEqual({ state: "closed", verificationPending: false })
  })

  it("an authenticated open-state check backfills normalized repository keys and advances the durable cursor", async () => {
    const lane = laneDoc({ status: "inactive", repoOwnerKey: undefined, repoNameKey: undefined })
    const ctx = createLaneCtx({ publishBranches: [lane] })

    const result = await (recordVerifiedPullRequestState as any).handler(ctx, {
      laneId: "lane_1",
      projectId: "project_1",
      prNumber: 42,
      repoOwner: "ACME",
      repoName: "Docs-Site",
      baseRepoFullName: "ACME/Docs-Site",
      baseBranch: "main",
      headRepoFullName: "ACME/Docs-Site",
      headBranch: "repopress/start",
      state: "open",
      merged: false,
      serverQueryToken: await mintServerQueryToken(),
    })

    expect(result).toEqual({ state: "open" })
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "lane_1",
      expect.objectContaining({
        repoOwnerKey: "acme",
        repoNameKey: "docs-site",
        lastStatusCheckedAt: expect.any(Number),
      }),
    )
  })

  it("keeps close verification pending while a reconciled modern attempt still owns lane state", async () => {
    const lane = laneDoc({ status: "active" })
    const ctx = createLaneCtx({
      activePublishAttempt: {
        _id: "attempt_reconciled",
        projectId: "project_1",
        publishBranchId: "lane_1",
        branchName: "repopress/start",
        planDigest: "d".repeat(64),
        status: "reconciled",
        createdAt: 10,
      },
      publishBranches: [lane],
    })

    const result = await (recordVerifiedPullRequestState as any).handler(ctx, {
      laneId: "lane_1",
      projectId: "project_1",
      prNumber: 42,
      repoOwner: "acme",
      repoName: "docs-site",
      baseRepoFullName: "acme/docs-site",
      baseBranch: "main",
      headRepoFullName: "acme/docs-site",
      headBranch: "repopress/start",
      state: "closed",
      merged: false,
      serverQueryToken: await mintServerQueryToken(),
    })

    expect(result).toEqual({ state: "closed", verificationPending: true })
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ closeVerificationState: "pending" }))
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "lane_1",
      expect.objectContaining({ closeVerificationState: "complete" }),
    )
  })

  it("handlePRClosed (webhook path) closes the lane AND invalidates its synchronization", async () => {
    const lane = laneDoc({ status: "active" })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: [committedLaneOp("op_lane", { filePath: "guides/a.mdx", opType: "delete" })],
    })

    await (handlePRClosed as any).handler(ctx, {
      prNumber: 42,
      repoOwner: "acme",
      repoName: "docs-site",
      baseRepoFullName: "acme/docs-site",
      baseBranch: "main",
      headRepoFullName: "acme/docs-site",
      headBranch: "repopress/start",
      serverQueryToken: await mintServerQueryToken(),
    })

    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ status: "closed" }))
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "op_lane",
      expect.objectContaining({ status: "pending", publishBranchId: undefined }),
    )
  })

  it("finishLaneCleanup refuses lanes that are still open", async () => {
    const ctx = createLaneCtx({ publishBranches: [laneDoc({ status: "active" })] })

    await expect(
      (finishLaneCleanup as any).handler(ctx, {
        id: "lane_1",
        userId: "user_owner",
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/closed or merged publish lanes/i)
  })

  it("finishLaneCleanup completes a deferred invalidation and clears the flag", async () => {
    const lane = laneDoc({ laneInvalidationPending: true, laneCleanupAction: "restore_legacy" })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: [committedLaneOp("op_lane", { filePath: "guides/a.mdx" })],
    })

    const result = await (finishLaneCleanup as any).handler(ctx, {
      id: "lane_1",
    })

    expect(result).toEqual(expect.objectContaining({ deferred: false, done: true, restoredOpIds: ["op_lane"] }))
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ laneInvalidationPending: undefined }))
  })

  it("finishLaneCleanup dispatches only the persisted restore action on a merged legacy lane", async () => {
    const lane = laneDoc({ status: "merged", laneCleanupAction: "restore_legacy" })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: [committedLaneOp("op_stranded", { filePath: "guides/a.mdx" })],
    })

    const result = await (finishLaneCleanup as any).handler(ctx, {
      id: "lane_1",
    })

    expect(result).toEqual(expect.objectContaining({ restoredOpIds: ["op_stranded"] }))
    expect(ctx.db.patch).toHaveBeenCalledWith("op_stranded", expect.objectContaining({ status: "pending" }))
  })

  it("the nightly cron drains deferred invalidations once the attempt resolves", async () => {
    const lane = laneDoc({ laneInvalidationPending: true, laneCleanupAction: "restore_legacy" })
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

    expect(result).toEqual({ processed: 0, tombstonesCleared: 0, lanesCleaned: 1 })
    expect(ctx.db.patch).toHaveBeenCalledWith("doc_lane", { publishedProvenance: undefined })
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ laneInvalidationPending: undefined }))
  })

  it("the nightly cron obeys persisted restore_legacy even when lane status is merged", async () => {
    const lane = laneDoc({
      status: "merged",
      laneInvalidationPending: true,
      laneCleanupAction: "restore_legacy",
    })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: [committedLaneOp("op_restore", { filePath: "guides/a.mdx" })],
    })

    await (cleanupStaleUploads as any).handler(ctx, {})

    expect(ctx.db.patch).toHaveBeenCalledWith("op_restore", expect.objectContaining({ status: "pending" }))
    expect(ctx.db.delete).not.toHaveBeenCalledWith("op_restore")
  })

  it("the nightly cron obeys persisted finalize_legacy even when lane status is closed", async () => {
    const lane = laneDoc({
      status: "closed",
      laneInvalidationPending: true,
      laneCleanupAction: "finalize_legacy",
    })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: [committedLaneOp("op_finalize", { filePath: "guides/a.mdx" })],
    })

    await (cleanupStaleUploads as any).handler(ctx, {})

    expect(ctx.db.delete).toHaveBeenCalledWith("op_finalize")
    expect(ctx.db.patch).not.toHaveBeenCalledWith("op_finalize", expect.objectContaining({ status: "pending" }))
  })

  it("the nightly cron skips a flagged lane with no persisted cleanup action", async () => {
    const lane = laneDoc({ status: "closed", laneInvalidationPending: true, laneCleanupAction: undefined })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: [committedLaneOp("op_untouched", { filePath: "guides/a.mdx" })],
    })

    const result = await (cleanupStaleUploads as any).handler(ctx, {})

    expect(result.lanesCleaned).toBe(0)
    expect(ctx.db.delete).not.toHaveBeenCalledWith("op_untouched")
    expect(ctx.db.patch).not.toHaveBeenCalledWith("op_untouched", expect.anything())
  })

  it("the nightly cron retries failed-delete tombstones and removes them on success", async () => {
    const ctx = createLaneCtx({
      mediaOps: [
        {
          _id: "tombstone_ok",
          projectId: "project_1",
          repoPath: "/public/a.png",
          sourceType: "convex",
          status: "failed",
          storageCleanupAt: 0,
          convexStorageId: "storage_recoverable",
          updatedAt: 10,
        },
        {
          _id: "tombstone_stuck",
          projectId: "project_1",
          repoPath: "/public/b.png",
          sourceType: "convex",
          status: "failed",
          storageCleanupAt: 0,
          convexStorageId: "storage_stuck",
          updatedAt: 10,
        },
      ],
      failingStorageIds: ["storage_stuck"],
    })

    const result = await (cleanupStaleUploads as any).handler(ctx, {})

    expect(result).toEqual({ processed: 0, tombstonesCleared: 1, lanesCleaned: 0 })
    expect(ctx.storage.delete).toHaveBeenCalledWith("storage_recoverable")
    expect(ctx.db.delete).toHaveBeenCalledWith("tombstone_ok")
    // The stuck object keeps its owning tombstone for the next run.
    expect(ctx.db.delete).not.toHaveBeenCalledWith("tombstone_stuck")
  })

  it("rotates failed tombstone retries so a recoverable 51st owner is eventually reached", async () => {
    const mediaOps = Array.from({ length: 51 }, (_, index) => ({
      _id: `tombstone_${index}`,
      projectId: "project_1",
      userId: "user_owner",
      repoPath: `/public/tombstone-${index}.png`,
      fileName: `tombstone-${index}.png`,
      mimeType: "image/png",
      sourceType: "convex",
      convexStorageId: `storage_${index}`,
      status: "failed",
      storageCleanupAt: 0,
      storageDeleteAttempts: 1,
      createdAt: index,
      updatedAt: index,
    }))
    const ctx = createLaneCtx({
      mediaOps,
      failingStorageIds: Array.from({ length: 50 }, (_, index) => `storage_${index}`),
    })

    const first = await (cleanupStaleUploads as any).handler(ctx, {})
    const second = await (cleanupStaleUploads as any).handler(ctx, {})

    expect(first.tombstonesCleared).toBe(0)
    expect(second.tombstonesCleared).toBe(1)
    expect(ctx.db.delete).toHaveBeenCalledWith("tombstone_50")
    expect(ctx.storage.delete).toHaveBeenCalledTimes(51)
  })

  it("keeps a stale upload as a failed tombstone when storage deletion fails", async () => {
    const ctx = createLaneCtx({
      mediaOps: [
        {
          _id: "stale_1",
          projectId: "project_1",
          userId: "user_owner",
          repoPath: "/public/stale.png",
          fileName: "stale.png",
          mimeType: "image/png",
          sourceType: "convex",
          convexStorageId: "storage_stale",
          status: "pending",
          storageCleanupAt: 0,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      failingStorageIds: ["storage_stale"],
    })

    await (cleanupStaleUploads as any).handler(ctx, {})

    expect(ctx.db.patch).toHaveBeenCalledWith("stale_1", expect.objectContaining({ status: "failed" }))
    expect(ctx.db.patch).not.toHaveBeenCalledWith("stale_1", expect.objectContaining({ status: "undone" }))
    expect(ctx.db.delete).not.toHaveBeenCalledWith("stale_1")
  })

  it("migrates a fresh legacy pending upload to indexed eligibility without deleting it early", async () => {
    const createdAt = Date.now()
    const ctx = createLaneCtx({
      mediaOps: [
        {
          _id: "legacy_fresh",
          projectId: "project_1",
          userId: "user_owner",
          repoPath: "/public/fresh.png",
          fileName: "fresh.png",
          mimeType: "image/png",
          sourceType: "convex",
          convexStorageId: "storage_fresh",
          status: "pending",
          createdAt,
          updatedAt: createdAt,
        },
      ],
    })

    const result = await (cleanupStaleUploads as any).handler(ctx, {})

    expect(result.processed).toBe(0)
    expect(ctx.storage.delete).not.toHaveBeenCalled()
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "legacy_fresh",
      expect.objectContaining({ storageCleanupAt: expect.any(Number) }),
    )
    const cleanupAt = ctx.db.patch.mock.calls.find(([id]: [string]) => id === "legacy_fresh")?.[1].storageCleanupAt
    expect(cleanupAt).toBeGreaterThan(createdAt)
  })

  it("uses only the fully keyed eligibility index for bounded media cleanup reads", async () => {
    const ctx = createLaneCtx()

    await (cleanupStaleUploads as any).handler(ctx, {})

    const mediaIndexes = ctx.cleanupTrace.indexes
      .filter(({ table }: { table: string }) => table === "mediaOps")
      .map(({ name }: { name: string }) => name)
    expect(mediaIndexes).toEqual(["by_storage_cleanup_eligibility", "by_storage_cleanup_eligibility"])
    expect(ctx.cleanupTrace.chainedFilters).toBe(0)
  })

  it("bounds each stale upload pass to 100 indexed owners", async () => {
    const mediaOps = Array.from({ length: 101 }, (_, index) => ({
      _id: `stale_${index}`,
      projectId: "project_1",
      userId: "user_owner",
      repoPath: `/public/${index}.png`,
      fileName: `${index}.png`,
      mimeType: "image/png",
      sourceType: "convex",
      convexStorageId: `storage_${index}`,
      status: "pending",
      storageCleanupAt: 0,
      createdAt: index,
      updatedAt: index,
    }))
    const ctx = createLaneCtx({ mediaOps })

    const result = await (cleanupStaleUploads as any).handler(ctx, {})

    expect(result.processed).toBe(100)
    expect(ctx.storage.delete).toHaveBeenCalledTimes(100)
    expect(ctx.db.delete).not.toHaveBeenCalledWith("stale_100")
  })

  it("durably defers an active-attempt prefix so the 101st stale owner is eventually reached", async () => {
    const mediaOps = Array.from({ length: 101 }, (_, index) => ({
      _id: `stale_${index}`,
      projectId: index < 100 ? "project_1" : "project_2",
      userId: "user_owner",
      repoPath: `/public/${index}.png`,
      fileName: `${index}.png`,
      mimeType: "image/png",
      sourceType: "convex",
      convexStorageId: `storage_${index}`,
      status: "pending",
      storageCleanupAt: 0,
      createdAt: index,
      updatedAt: index,
    }))
    const ctx = createLaneCtx({
      activePublishAttempt: {
        _id: "attempt_1",
        projectId: "project_1",
        branchName: "repopress/start",
        planDigest: "d".repeat(64),
        status: "committed",
      },
      mediaOps,
    })

    const first = await (cleanupStaleUploads as any).handler(ctx, {})
    const second = await (cleanupStaleUploads as any).handler(ctx, {})

    expect(first.processed).toBe(0)
    expect(second.processed).toBe(1)
    expect(ctx.storage.delete).toHaveBeenCalledWith("storage_100")
    expect(ctx.db.delete).toHaveBeenCalledWith("stale_100")
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

    expect(result).toEqual({ processed: 0, tombstonesCleared: 0, lanesCleaned: 0 })
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_lane", expect.anything())
  })
})

describe("merged-lane finalization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    safeGetAuthUserMock.mockResolvedValue(null)
  })

  function mergedLane(overrides: Record<string, unknown> = {}) {
    return laneDoc({ status: "merged", committedFilePaths: ["content/guides/a.mdx"], ...overrides })
  }

  it("spends the lane's committed rows and publishes the merged documents (idempotent)", async () => {
    const lane = mergedLane()
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: [
        committedLaneOp("op_lane", { filePath: "guides/a.mdx" }),
        committedLaneOp("op_other_lane", { filePath: "guides/other.mdx", publishBranchId: "lane_OTHER" }),
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
          _id: "doc_merged",
          projectId: "project_1",
          filePath: "guides/a.mdx",
          status: "draft",
          body: "# A",
          updatedAt: 5,
          contentVersion: 2,
          publishedProvenance: {
            publishBranchId: "lane_1",
            commitSha: "legacy-commit",
            publishedUpdatedAt: 5,
            publishedContentVersion: 2,
          },
        },
        {
          _id: "doc_unrelated",
          projectId: "project_1",
          filePath: "guides/z.mdx",
          status: "draft",
          body: "# Z",
          updatedAt: 5,
        },
      ],
    })

    const result = await finalizeMergedLaneSync(ctx, lane as any)

    expect(result).toEqual({
      deferred: false,
      done: true,
      clearedOpIds: ["op_lane"],
      clearedMediaOpIds: ["media_lane"],
      publishedDocumentIds: ["doc_merged"],
    })
    expect(ctx.db.delete).toHaveBeenCalledWith("op_lane")
    expect(ctx.db.delete).toHaveBeenCalledWith("media_lane")
    expect(ctx.storage.delete).toHaveBeenCalledWith("storage_1")
    expect(ctx.db.patch).toHaveBeenCalledWith("doc_merged", expect.objectContaining({ status: "published" }))
    expect(ctx.db.delete).not.toHaveBeenCalledWith("op_other_lane")
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_unrelated", expect.anything())

    // A second pass (the other close/merge path firing later) is a no-op.
    const replay = await finalizeMergedLaneSync(ctx, lane as any)
    expect(replay).toEqual(
      expect.objectContaining({ done: true, clearedOpIds: [], clearedMediaOpIds: [], publishedDocumentIds: [] }),
    )
  })

  it("never publishes an attempt-owned or newer-edited document during legacy continuation", async () => {
    const lane = mergedLane({ laneInvalidationPending: true, laneCleanupAction: "finalize_legacy" })
    const modernProvenance = {
      publishBranchId: "lane_1",
      publishAttemptId: "attempt_modern",
      commitSha: "1".repeat(40),
      publishedUpdatedAt: 10,
      publishedContentVersion: 3,
    }
    const ctx = createLaneCtx({
      activePublishAttempt: {
        _id: "attempt_modern",
        projectId: "project_1",
        publishBranchId: "lane_1",
        branchName: "repopress/start",
        planDigest: "d".repeat(64),
        status: "reconciled",
      },
      publishBranches: [lane],
      documents: [
        {
          _id: "doc_modern_edited",
          projectId: "project_1",
          filePath: "guides/a.mdx",
          status: "draft",
          body: "newer edit",
          contentVersion: 4,
          updatedAt: 20,
          publishedProvenance: modernProvenance,
        },
      ],
    })

    const result = await finalizeMergedLaneSync(ctx, lane as any)

    expect(result).toEqual(expect.objectContaining({ done: true, publishedDocumentIds: [] }))
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_modern_edited", expect.anything())
  })

  it("defers durably while a publish attempt is at the commit boundary", async () => {
    const lane = mergedLane()
    const ctx = createLaneCtx({
      activePublishAttempt: {
        _id: "attempt_1",
        projectId: "project_1",
        branchName: "repopress/start",
        planDigest: "d".repeat(64),
        status: "committed",
      },
      publishBranches: [lane],
      explorerOps: [committedLaneOp("op_lane", { filePath: "guides/a.mdx" })],
    })

    const result = await finalizeMergedLaneSync(ctx, lane as any)

    expect(result).toEqual({ deferred: true })
    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ laneInvalidationPending: true }))
    expect(ctx.db.delete).not.toHaveBeenCalled()
  })

  it("splits large lanes into bounded batches and publishes documents only on the final pass", async () => {
    const manyOps = Array.from({ length: LANE_CLEANUP_BATCH + 3 }, (_v, index) =>
      committedLaneOp(`op_${index}`, { filePath: `guides/file-${index}.mdx` }),
    )
    const lane = mergedLane()
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: manyOps,
      documents: [
        {
          _id: "doc_merged",
          projectId: "project_1",
          filePath: "guides/a.mdx",
          status: "draft",
          body: "# A",
          updatedAt: 5,
          contentVersion: 2,
          publishedProvenance: {
            publishBranchId: "lane_1",
            commitSha: "legacy-commit",
            publishedUpdatedAt: 5,
            publishedContentVersion: 2,
          },
        },
      ],
    })

    const first = await finalizeMergedLaneSync(ctx, lane as any)
    expect(first).toEqual(expect.objectContaining({ done: false, publishedDocumentIds: [] }))
    expect((first as { clearedOpIds: string[] }).clearedOpIds).toHaveLength(LANE_CLEANUP_BATCH)
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), { id: "lane_1" })
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_merged", expect.anything())

    const second = await finalizeMergedLaneSync(ctx, lane as any)
    expect(second).toEqual(expect.objectContaining({ done: true, publishedDocumentIds: ["doc_merged"] }))
  })

  it("server-verified status records authority without finalizing attempt-owned content", async () => {
    const lane = mergedLane({ status: "active" })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: [committedLaneOp("op_lane", { filePath: "guides/a.mdx" })],
      documents: [
        {
          _id: "doc_merged",
          projectId: "project_1",
          filePath: "guides/a.mdx",
          status: "draft",
          body: "# A",
          updatedAt: 5,
        },
      ],
    })

    const result = await (recordVerifiedPullRequestState as any).handler(ctx, {
      laneId: "lane_1",
      projectId: "project_1",
      prNumber: 42,
      mergeCommitSha: "a".repeat(40),
      repoOwner: "acme",
      repoName: "docs-site",
      baseRepoFullName: "acme/docs-site",
      baseBranch: "main",
      headRepoFullName: "acme/docs-site",
      headBranch: "repopress/start",
      state: "closed",
      merged: true,
      serverQueryToken: await mintServerQueryToken(),
    })

    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ status: "merged" }))
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "lane_1",
      expect.objectContaining({
        status: "merged",
        mergeCommitSha: "a".repeat(40),
        mergeVerificationState: "pending",
      }),
    )
    expect(ctx.db.delete).not.toHaveBeenCalled()
    expect(ctx.db.patch).not.toHaveBeenCalledWith("doc_merged", expect.objectContaining({ status: "published" }))
    expect(result).toEqual(expect.objectContaining({ verificationState: "pending" }))
  })

  it("handlePRMerged records authority without running shared lane finalization", async () => {
    const lane = mergedLane({ status: "active" })
    const ctx = createLaneCtx({
      publishBranches: [lane],
      explorerOps: [committedLaneOp("op_lane", { filePath: "guides/a.mdx" })],
    })

    await (handlePRMerged as any).handler(ctx, {
      prNumber: 42,
      mergeCommitSha: "a".repeat(40),
      repoOwner: "acme",
      repoName: "docs-site",
      baseRepoFullName: "acme/docs-site",
      baseBranch: "main",
      headRepoFullName: "acme/docs-site",
      headBranch: "repopress/start",
      serverQueryToken: await mintServerQueryToken(),
    })

    expect(ctx.db.patch).toHaveBeenCalledWith("lane_1", expect.objectContaining({ status: "merged" }))
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "lane_1",
      expect.objectContaining({ mergeCommitSha: "a".repeat(40), mergeVerificationState: "pending" }),
    )
    expect(ctx.db.delete).not.toHaveBeenCalled()
  })
})
