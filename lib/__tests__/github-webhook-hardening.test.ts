import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/convex/_generated/server", () => ({
  mutation: (definition: unknown) => definition,
}))

vi.mock("@/convex/_generated/api", () => ({
  internal: {
    publishBranches: {
      continueLaneCleanup: "internal:publishBranches.continueLaneCleanup",
    },
    mediaOps: {
      cleanupMediaForBranch: "internal:mediaOps.cleanupMediaForBranch",
    },
  },
}))

import { handlePRClosed, handlePRMerged } from "@/convex/githubWebhook"
import { mintServerQueryToken } from "@/lib/project-access-token"

const MERGE_SHA = "a".repeat(40)
const PR_IDENTITY = {
  prNumber: 42,
  repoOwner: "acme",
  repoName: "docs-site",
  baseRepoFullName: "acme/docs-site",
  baseBranch: "main",
  headRepoFullName: "acme/docs-site",
  headBranch: "repopress/start",
}

function createCtx() {
  return {
    db: {
      get: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      query: vi.fn(() => ({
        withIndex: () => ({
          first: vi.fn().mockResolvedValue(null),
          take: vi.fn().mockResolvedValue([]),
          collect: vi.fn().mockResolvedValue([]),
        }),
      })),
    },
    scheduler: {
      runAfter: vi.fn().mockResolvedValue(undefined),
    },
  } as any
}

function createWebhookCtx({
  publishBranch,
  publishBranches,
  explorerOps = [],
  mediaOps = [],
  project = { _id: "project_1", repoOwner: "acme", repoName: "docs-site" },
}: {
  publishBranch: Record<string, unknown> | null
  publishBranches?: Array<Record<string, unknown>>
  explorerOps?: Array<Record<string, unknown>>
  mediaOps?: Array<Record<string, unknown>>
  project?: Record<string, unknown> | null
}) {
  const lanes: Array<Record<string, unknown>> = (publishBranches ?? (publishBranch ? [publishBranch] : [])).map(
    (candidate) => {
      const lane = {
        repoOwner: "acme",
        repoName: "docs-site",
        prNumber: 42,
        baseBranch: "main",
        branchName: "repopress/start",
        ...candidate,
      }
      return {
        ...lane,
        repoOwnerKey: String(lane.repoOwner).toLowerCase(),
        repoNameKey: String(lane.repoName).toLowerCase(),
      }
    },
  )
  const lane = lanes[0] ?? null
  return {
    db: {
      get: vi.fn().mockImplementation(async (id: string) => {
        if (lane && id === lane._id) return lane
        if (project && id === lane?.projectId) return project
        return null
      }),
      patch: vi.fn(),
      delete: vi.fn(),
      query: vi.fn((table: string) => ({
        withIndex: (indexName: string, cb?: (q: unknown) => unknown) => {
          // Record eq() values so lane-scoped indexes (e.g.
          // by_publishBranchId_status) select rows like the real ones.
          const eq: Record<string, unknown> = {}
          const recorder: Record<string, unknown> = {
            eq: (field: string, value: unknown) => {
              eq[field] = value
              return recorder
            },
          }
          cb?.(recorder)
          const rows = (() => {
            if (table === "publishBranches" && indexName === "by_repo_key_pr_head_base") {
              return lanes.filter((candidate) =>
                Object.entries(eq).every(([field, value]) => candidate[field] === value),
              )
            }
            const source = table === "explorerOps" ? explorerOps : table === "mediaOps" ? mediaOps : []
            return source.filter((row) =>
              Object.entries(eq).every(
                ([field, value]) => field === "projectId" || (row as Record<string, unknown>)[field] === value,
              ),
            )
          })()
          return {
            first: vi.fn().mockImplementation(async () => rows[0] ?? null),
            collect: vi.fn().mockImplementation(async () => rows),
            take: vi.fn().mockImplementation(async (count: number) => rows.slice(0, count)),
          }
        },
      })),
    },
    scheduler: {
      runAfter: vi.fn().mockResolvedValue(undefined),
    },
    storage: {
      delete: vi.fn().mockResolvedValue(undefined),
    },
  } as any
}

describe("GitHub webhook hardening", () => {
  beforeEach(() => {
    process.env.REPOPRESS_CAPABILITY_SECRET = "test-capability-secret-at-least-32"
  })

  it("rejects merged webhook mutations without a server token", async () => {
    const ctx = createCtx()

    await expect(
      (handlePRMerged as any).handler(ctx, {
        prNumber: 42,
        mergeCommitSha: MERGE_SHA,
        repoOwner: "acme",
        repoName: "docs-site",
        baseRepoFullName: "acme/docs-site",
        baseBranch: "main",
        headRepoFullName: "acme/docs-site",
        headBranch: "repopress/start",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.db.query).not.toHaveBeenCalled()
  })

  it("rejects closed webhook mutations without a server token", async () => {
    const ctx = createCtx()

    await expect(
      (handlePRClosed as any).handler(ctx, {
        ...PR_IDENTITY,
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.db.query).not.toHaveBeenCalled()
  })

  it("allows merged webhook mutations with a valid server token", async () => {
    const ctx = createCtx()
    const serverQueryToken = await mintServerQueryToken()

    await expect(
      (handlePRMerged as any).handler(ctx, {
        prNumber: 42,
        mergeCommitSha: MERGE_SHA,
        repoOwner: "acme",
        repoName: "docs-site",
        baseRepoFullName: "acme/docs-site",
        baseBranch: "main",
        headRepoFullName: "acme/docs-site",
        headBranch: "repopress/start",
        serverQueryToken,
      }),
    ).resolves.toBeUndefined()

    expect(ctx.db.query).toHaveBeenCalled()
  })

  it("finds a merged lane when GitHub sends repository casing different from the stored project", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_mixed_case",
        projectId: "project_1",
        status: "inactive",
      },
    })

    await (handlePRMerged as any).handler(ctx, {
      ...PR_IDENTITY,
      repoOwner: "ACME",
      repoName: "Docs-Site",
      baseRepoFullName: "ACME/Docs-Site",
      headRepoFullName: "ACME/Docs-Site",
      mergeCommitSha: MERGE_SHA,
      serverQueryToken,
    })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "publish_branch_mixed_case",
      expect.objectContaining({ status: "merged", repoOwnerKey: "acme", repoNameKey: "docs-site" }),
    )
  })

  it("finds a closed lane when GitHub sends repository casing different from the stored project", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_mixed_case",
        projectId: "project_1",
        status: "inactive",
      },
    })

    await (handlePRClosed as any).handler(ctx, {
      ...PR_IDENTITY,
      repoOwner: "ACME",
      repoName: "Docs-Site",
      baseRepoFullName: "ACME/Docs-Site",
      headRepoFullName: "ACME/Docs-Site",
      serverQueryToken,
    })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "publish_branch_mixed_case",
      expect.objectContaining({ status: "closed", repoOwnerKey: "acme", repoNameKey: "docs-site" }),
    )
  })

  it("records immutable merge authority without mutating staged content", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_inactive",
        projectId: "project_1",
        status: "inactive",
        branchName: "repopress/start",
        committedFilePaths: [],
      },
      explorerOps: [
        {
          _id: "explorer_op_for_branch_42",
          projectId: "project_1",
          status: "committed",
          publishBranchId: "publish_branch_inactive",
        },
        {
          _id: "explorer_op_for_branch_84",
          projectId: "project_1",
          status: "committed",
          publishBranchId: "publish_branch_other",
        },
        {
          _id: "explorer_op_pending_for_branch_42",
          projectId: "project_1",
          status: "pending",
          publishBranchId: "publish_branch_inactive",
        },
      ],
      mediaOps: [
        {
          _id: "media_op_for_branch_42",
          projectId: "project_1",
          status: "committed",
          publishBranchId: "publish_branch_inactive",
        },
        {
          _id: "media_op_for_branch_84",
          projectId: "project_1",
          status: "committed",
          publishBranchId: "publish_branch_other",
        },
      ],
    })

    await (handlePRMerged as any).handler(ctx, {
      prNumber: 42,
      mergeCommitSha: MERGE_SHA,
      repoOwner: "acme",
      repoName: "docs-site",
      baseRepoFullName: "acme/docs-site",
      baseBranch: "main",
      headRepoFullName: "acme/docs-site",
      headBranch: "repopress/start",
      serverQueryToken,
    })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "publish_branch_inactive",
      expect.objectContaining({
        status: "merged",
        mergeCommitSha: MERGE_SHA,
        mergeVerificationState: "pending",
      }),
    )
    expect(ctx.db.delete).not.toHaveBeenCalled()
    expect(ctx.storage.delete).not.toHaveBeenCalled()
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(0, "internal:publishBranches.continueLaneCleanup", {
      id: "publish_branch_inactive",
    })
  })

  it("keeps completed verification complete on same-authority replay and rejects a different SHA", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const publishBranch = {
      _id: "publish_branch_inactive",
      projectId: "project_1",
      status: "merged",
      branchName: "repopress/start",
      mergeCommitSha: MERGE_SHA,
      mergeVerificationState: "complete",
    }
    const ctx = createWebhookCtx({ publishBranch })

    await (handlePRMerged as any).handler(ctx, {
      prNumber: 42,
      mergeCommitSha: MERGE_SHA,
      repoOwner: "acme",
      repoName: "docs-site",
      baseRepoFullName: "acme/docs-site",
      baseBranch: "main",
      headRepoFullName: "acme/docs-site",
      headBranch: "repopress/start",
      serverQueryToken,
    })
    expect(ctx.db.patch).not.toHaveBeenCalled()

    await expect(
      (handlePRMerged as any).handler(ctx, {
        prNumber: 42,
        mergeCommitSha: "b".repeat(40),
        repoOwner: "acme",
        repoName: "docs-site",
        baseRepoFullName: "acme/docs-site",
        baseBranch: "main",
        headRepoFullName: "acme/docs-site",
        headBranch: "repopress/start",
        serverQueryToken,
      }),
    ).rejects.toThrow("authority")
  })

  it("rejects a same-number PR from another repository or head branch", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_inactive",
        projectId: "project_1",
        status: "inactive",
        branchName: "repopress/start",
      },
    })

    await (handlePRMerged as any).handler(ctx, {
      prNumber: 42,
      mergeCommitSha: MERGE_SHA,
      repoOwner: "other",
      repoName: "docs-site",
      baseRepoFullName: "other/docs-site",
      baseBranch: "main",
      headRepoFullName: "other/docs-site",
      headBranch: "repopress/start",
      serverQueryToken,
    })
    expect(ctx.db.patch).not.toHaveBeenCalled()

    await (handlePRMerged as any).handler(ctx, {
      prNumber: 42,
      mergeCommitSha: MERGE_SHA,
      repoOwner: "acme",
      repoName: "docs-site",
      baseRepoFullName: "acme/docs-site",
      baseBranch: "main",
      headRepoFullName: "acme/docs-site",
      headBranch: "repopress/other",
      serverQueryToken,
    })
    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("rejects a fork head even when the base repository and branch name collide", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_inactive",
        projectId: "project_1",
        status: "inactive",
        branchName: "repopress/start",
      },
    })

    await expect(
      (handlePRMerged as any).handler(ctx, {
        prNumber: 42,
        mergeCommitSha: MERGE_SHA,
        repoOwner: "acme",
        repoName: "docs-site",
        baseRepoFullName: "acme/docs-site",
        baseBranch: "main",
        headRepoFullName: "attacker/docs-site",
        headBranch: "repopress/start",
        serverQueryToken,
      }),
    ).rejects.toThrow(/identity/i)

    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("closing an inactive PR only updates that publish branch", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_inactive",
        projectId: "project_1",
        status: "inactive",
      },
    })

    await (handlePRClosed as any).handler(ctx, {
      ...PR_IDENTITY,
      serverQueryToken,
    })

    expect(ctx.db.patch).toHaveBeenCalledWith("publish_branch_inactive", expect.objectContaining({ status: "closed" }))
    expect(ctx.db.delete).not.toHaveBeenCalled()
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled()
  })

  it("scopes an unmerged close to the exact repository identity", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_acme",
        projectId: "project_1",
        status: "inactive",
      },
    })

    await (handlePRClosed as any).handler(ctx, {
      ...PR_IDENTITY,
      repoOwner: "other",
      baseRepoFullName: "other/docs-site",
      headRepoFullName: "other/docs-site",
      serverQueryToken,
    })

    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("finds the exact merged lane even after more than twenty colliding PR numbers", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const collisions = Array.from({ length: 21 }, (_, index) => ({
      _id: `collision_${index}`,
      projectId: "project_1",
      repoOwner: `other-${index}`,
      repoName: "docs-site",
      prNumber: 42,
      branchName: "repopress/start",
      baseBranch: "main",
      status: "inactive",
    }))
    const ctx = createWebhookCtx({
      publishBranch: null,
      publishBranches: [
        ...collisions,
        {
          _id: "publish_branch_exact",
          projectId: "project_1",
          repoOwner: "acme",
          repoName: "docs-site",
          prNumber: 42,
          branchName: "repopress/start",
          baseBranch: "main",
          status: "inactive",
        },
      ],
    })

    await (handlePRMerged as any).handler(ctx, {
      ...PR_IDENTITY,
      mergeCommitSha: MERGE_SHA,
      serverQueryToken,
    })

    expect(ctx.db.patch).toHaveBeenCalledWith("publish_branch_exact", expect.objectContaining({ status: "merged" }))
  })

  it("merging the current active PR does not delete any committed ops before verification", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_current",
        projectId: "project_1",
        status: "active",
        branchName: "repopress/start",
        committedFilePaths: [],
      },
      explorerOps: [
        {
          _id: "explorer_op_for_current_branch",
          projectId: "project_1",
          status: "committed",
          publishBranchId: "publish_branch_current",
        },
        {
          _id: "explorer_op_for_other_open_pr",
          projectId: "project_1",
          status: "committed",
          publishBranchId: "publish_branch_inactive",
        },
      ],
      mediaOps: [
        {
          _id: "media_op_for_current_branch",
          projectId: "project_1",
          status: "committed",
          publishBranchId: "publish_branch_current",
        },
        {
          _id: "media_op_for_other_open_pr",
          projectId: "project_1",
          status: "committed",
          publishBranchId: "publish_branch_inactive",
        },
      ],
    })

    await (handlePRMerged as any).handler(ctx, {
      prNumber: 42,
      mergeCommitSha: MERGE_SHA,
      repoOwner: "acme",
      repoName: "docs-site",
      baseRepoFullName: "acme/docs-site",
      baseBranch: "main",
      headRepoFullName: "acme/docs-site",
      headBranch: "repopress/start",
      serverQueryToken,
    })

    expect(ctx.db.patch).toHaveBeenCalledWith("publish_branch_current", expect.objectContaining({ status: "merged" }))
    expect(ctx.db.delete).not.toHaveBeenCalled()
  })

  it("does not release committed media storage until merge verification", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_current",
        projectId: "project_1",
        status: "active",
        branchName: "repopress/start",
        committedFilePaths: [],
      },
      mediaOps: [
        {
          _id: "media_op_for_current_branch",
          projectId: "project_1",
          status: "committed",
          publishBranchId: "publish_branch_current",
          convexStorageId: "storage_1",
        },
      ],
    })

    await (handlePRMerged as any).handler(ctx, {
      prNumber: 42,
      mergeCommitSha: MERGE_SHA,
      repoOwner: "acme",
      repoName: "docs-site",
      baseRepoFullName: "acme/docs-site",
      baseBranch: "main",
      headRepoFullName: "acme/docs-site",
      headBranch: "repopress/start",
      serverQueryToken,
    })

    expect(ctx.storage.delete).not.toHaveBeenCalled()
    expect(ctx.db.delete).not.toHaveBeenCalled()
  })

  it("closing a PR does not discard staged media for a later republish", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_inactive",
        projectId: "project_1",
        status: "inactive",
      },
    })

    await (handlePRClosed as any).handler(ctx, {
      ...PR_IDENTITY,
      serverQueryToken,
    })

    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled()
  })
})
