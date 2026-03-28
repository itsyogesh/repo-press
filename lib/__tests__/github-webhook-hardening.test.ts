import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/convex/_generated/server", () => ({
  mutation: (definition: unknown) => definition,
}))

import { handlePRClosed, handlePRMerged } from "@/convex/githubWebhook"
import { mintServerQueryToken } from "@/lib/project-access-token"

function createCtx() {
  return {
    db: {
      get: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      query: vi.fn(() => ({
        withIndex: () => ({
          first: vi.fn().mockResolvedValue(null),
          collect: vi.fn().mockResolvedValue([]),
        }),
      })),
    },
  } as any
}

function createWebhookCtx({
  publishBranch,
  explorerOps = [],
  mediaOps = [],
}: {
  publishBranch: Record<string, unknown> | null
  explorerOps?: Array<Record<string, unknown>>
  mediaOps?: Array<Record<string, unknown>>
}) {
  return {
    db: {
      get: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      query: vi.fn((table: string) => ({
        withIndex: (indexName: string) => ({
          first: vi.fn().mockImplementation(async () => {
            if (table === "publishBranches" && indexName === "by_prNumber") {
              return publishBranch
            }

            return null
          }),
          collect: vi.fn().mockImplementation(async () => {
            if (table === "explorerOps" && indexName === "by_projectId_status") {
              return explorerOps
            }

            if (table === "mediaOps" && indexName === "by_projectId_status") {
              return mediaOps
            }

            return []
          }),
        }),
      })),
    },
  } as any
}

describe("GitHub webhook hardening", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret"
  })

  it("rejects merged webhook mutations without a server token", async () => {
    const ctx = createCtx()

    await expect(
      (handlePRMerged as any).handler(ctx, {
        prNumber: 42,
        mergeCommitSha: "abc123",
      }),
    ).rejects.toThrow("Unauthorized")

    expect(ctx.db.query).not.toHaveBeenCalled()
  })

  it("rejects closed webhook mutations without a server token", async () => {
    const ctx = createCtx()

    await expect(
      (handlePRClosed as any).handler(ctx, {
        prNumber: 42,
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
        mergeCommitSha: "abc123",
        serverQueryToken,
      }),
    ).resolves.toBeUndefined()

    expect(ctx.db.query).toHaveBeenCalled()
  })

  it("merging an inactive PR only clears committed ops for that publish branch", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_inactive",
        projectId: "project_1",
        status: "inactive",
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
      mergeCommitSha: "merge-sha-1",
      serverQueryToken,
    })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "publish_branch_inactive",
      expect.objectContaining({ status: "merged" }),
    )
    expect(ctx.db.delete).toHaveBeenCalledWith("explorer_op_for_branch_42")
    expect(ctx.db.delete).toHaveBeenCalledWith("media_op_for_branch_42")
    expect(ctx.db.delete).not.toHaveBeenCalledWith("explorer_op_for_branch_84")
    expect(ctx.db.delete).not.toHaveBeenCalledWith("media_op_for_branch_84")
    expect(ctx.db.delete).not.toHaveBeenCalledWith("explorer_op_pending_for_branch_42")
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
      prNumber: 42,
      serverQueryToken,
    })

    expect(ctx.db.patch).toHaveBeenCalledTimes(1)
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "publish_branch_inactive",
      expect.objectContaining({ status: "closed" }),
    )
    expect(ctx.db.delete).not.toHaveBeenCalled()
  })

  it("merging the current active PR does not delete committed ops from unrelated open PRs", async () => {
    const serverQueryToken = await mintServerQueryToken()
    const ctx = createWebhookCtx({
      publishBranch: {
        _id: "publish_branch_current",
        projectId: "project_1",
        status: "active",
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
      mergeCommitSha: "merge-sha-2",
      serverQueryToken,
    })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "publish_branch_current",
      expect.objectContaining({ status: "merged" }),
    )
    expect(ctx.db.delete).toHaveBeenCalledWith("explorer_op_for_current_branch")
    expect(ctx.db.delete).toHaveBeenCalledWith("media_op_for_current_branch")
    expect(ctx.db.delete).not.toHaveBeenCalledWith("explorer_op_for_other_open_pr")
    expect(ctx.db.delete).not.toHaveBeenCalledWith("media_op_for_other_open_pr")
  })
})
