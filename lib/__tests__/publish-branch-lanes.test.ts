import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { safeGetAuthUserMock } = vi.hoisted(() => ({
  safeGetAuthUserMock: vi.fn(),
}))

vi.mock("@/convex/_generated/server", () => ({
  mutation: (definition: unknown) => definition,
  query: (definition: unknown) => definition,
}))

vi.mock("@/convex/auth", () => ({
  authComponent: {
    safeGetAuthUser: safeGetAuthUserMock,
  },
}))

import { markCommitted as markExplorerOpsCommitted } from "@/convex/explorerOps"
import { markCommitted as markMediaOpsCommitted } from "@/convex/mediaOps"
import { create, deactivateCurrentForProject, getCurrentForProject, listOpenForProject } from "@/convex/publishBranches"

function createProject() {
  return {
    _id: "project_1",
    userId: "user_owner",
    repoOwner: "acme",
    repoName: "docs",
    branch: "main",
  }
}

function createCtx(overrides?: {
  get?: ReturnType<typeof vi.fn>
  insert?: ReturnType<typeof vi.fn>
  patch?: ReturnType<typeof vi.fn>
  query?: ReturnType<typeof vi.fn>
}) {
  return {
    db: {
      get: overrides?.get ?? vi.fn(),
      insert: overrides?.insert ?? vi.fn(),
      patch: overrides?.patch ?? vi.fn(),
      query: overrides?.query ?? vi.fn(),
    },
  } as any
}

describe("Publish branch lanes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue({ _id: "user_owner" })
  })

  it("returns the current publish branch for a project", async () => {
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue(createProject()),
      query: vi.fn().mockReturnValue({
        withIndex: () => ({
          first: vi.fn().mockResolvedValue({
            _id: "publish_branch_current",
            projectId: "project_1",
            status: "active",
          }),
        }),
      }),
    })

    const result = await (getCurrentForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
    })

    expect(result?._id).toBe("publish_branch_current")
  })

  it("demotes the current lane before a new one is created", async () => {
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue(createProject()),
      query: vi.fn().mockReturnValue({
        withIndex: () => ({
          first: vi.fn().mockResolvedValue({
            _id: "publish_branch_current",
            projectId: "project_1",
            status: "active",
          }),
        }),
      }),
      patch: vi.fn(),
    })

    await (deactivateCurrentForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
    })

    expect(ctx.db.patch).toHaveBeenCalledWith("publish_branch_current", expect.objectContaining({ status: "inactive" }))
  })

  it("rejects creating a new active lane when one already exists", async () => {
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue(createProject()),
      insert: vi.fn(),
      query: vi.fn().mockReturnValue({
        withIndex: () => ({
          first: vi.fn().mockResolvedValue({
            _id: "publish_branch_current",
            projectId: "project_1",
            status: "active",
          }),
        }),
      }),
    })

    await expect(
      (create as any).handler(ctx, {
        projectId: "project_1",
        userId: "user_owner",
        branchName: "repopress/main/5678",
        baseBranch: "main",
      }),
    ).rejects.toThrow("Active publish branch already exists for project")
    expect(ctx.db.insert).not.toHaveBeenCalled()
  })

  it("lists current and inactive open lanes for a project", async () => {
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue(createProject()),
      query: vi
        .fn()
        .mockReturnValueOnce({
          withIndex: () => ({
            collect: vi.fn().mockResolvedValue([
              {
                _id: "publish_branch_current",
                projectId: "project_1",
                status: "active",
              },
            ]),
          }),
        })
        .mockReturnValueOnce({
          withIndex: () => ({
            collect: vi.fn().mockResolvedValue([
              {
                _id: "publish_branch_inactive",
                projectId: "project_1",
                status: "inactive",
              },
            ]),
          }),
        }),
    })

    const result = await (listOpenForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
    })

    expect(result.map((branch: { _id: string }) => branch._id)).toEqual([
      "publish_branch_current",
      "publish_branch_inactive",
    ])
  })

  it("stores publishBranchId on committed explorer ops", async () => {
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "explorer_op_1",
          projectId: "project_1",
          status: "pending",
        })
        .mockResolvedValueOnce(createProject()),
      patch: vi.fn(),
    })

    await (markExplorerOpsCommitted as any).handler(ctx, {
      ids: ["explorer_op_1"],
      commitSha: "commit_123",
      publishBranchId: "publish_branch_current",
      userId: "user_owner",
    })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "explorer_op_1",
      expect.objectContaining({
        status: "committed",
        commitSha: "commit_123",
        publishBranchId: "publish_branch_current",
      }),
    )
  })

  it("stores publishBranchId on committed media ops", async () => {
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "media_op_1",
          projectId: "project_1",
          status: "pending",
        })
        .mockResolvedValueOnce(createProject()),
      patch: vi.fn(),
    })

    await (markMediaOpsCommitted as any).handler(ctx, {
      ids: ["media_op_1"],
      commitSha: "commit_123",
      publishBranchId: "publish_branch_current",
      userId: "user_owner",
    })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "media_op_1",
      expect.objectContaining({
        status: "committed",
        commitSha: "commit_123",
        publishBranchId: "publish_branch_current",
      }),
    )
  })

  it("models inactive publish branches and committed op branch tags in schema", () => {
    const schemaSource = readFileSync(join(process.cwd(), "convex/schema.ts"), "utf8")

    expect(schemaSource).toContain('v.literal("inactive")')
    expect(schemaSource).toContain('publishBranchId: v.optional(v.id("publishBranches"))')
  })
})
