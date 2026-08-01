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

import { discardAll } from "@/convex/explorerOps"

function createCtx({
  project,
  pendingOps = [],
  pendingMediaOps = [],
  draftDocs = [],
  approvedDocs = [],
  createdDocs = [],
}: {
  project: Record<string, unknown>
  pendingOps?: Record<string, unknown>[]
  pendingMediaOps?: Record<string, unknown>[]
  draftDocs?: Record<string, unknown>[]
  approvedDocs?: Record<string, unknown>[]
  createdDocs?: Record<string, unknown>[]
}) {
  let documentsCollectCount = 0

  return {
    db: {
      get: vi.fn().mockResolvedValue(project),
      patch: vi.fn(),
      delete: vi.fn(),
      query: vi.fn((tableName: string) => {
        if (tableName === "publishAttempts") {
          // No publish attempt is at the commit boundary in these scenarios.
          return {
            withIndex: () => ({
              first: vi.fn().mockResolvedValue(null),
            }),
          }
        }

        if (tableName === "explorerOps") {
          return {
            withIndex: () => ({
              collect: vi.fn().mockResolvedValue(pendingOps),
            }),
          }
        }

        if (tableName === "mediaOps") {
          return {
            withIndex: () => ({
              collect: vi.fn().mockResolvedValue(pendingMediaOps),
            }),
          }
        }

        if (tableName === "documents") {
          return {
            withIndex: () => ({
              collect: vi.fn().mockImplementation(async () => {
                documentsCollectCount += 1
                return documentsCollectCount === 1 ? draftDocs : approvedDocs
              }),
              first: vi.fn().mockResolvedValue(createdDocs[0] ?? null),
              filter: () => ({ first: vi.fn().mockResolvedValue(createdDocs[0] ?? null) }),
            }),
          }
        }

        throw new Error(`Unexpected query table: ${tableName}`)
      }),
    },
    storage: { delete: vi.fn() },
  } as any
}

describe("Discard all hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue({ _id: "user_owner" })
  })

  it("marks pending media ops undone when discarding all project changes", async () => {
    const ctx = createCtx({
      project: {
        _id: "project_1",
        userId: "user_owner",
        repoOwner: "acme",
        repoName: "docs",
        branch: "main",
      },
      pendingMediaOps: [
        {
          _id: "media_op_1",
          projectId: "project_1",
          repoPath: "/public/images/blog/post/hero.png",
          status: "pending",
        },
      ],
    })

    await (discardAll as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
    })

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "media_op_1",
      expect.objectContaining({
        status: "undone",
      }),
    )
  })

  it("preserves clean base and lane documents while clearing only genuinely dirty content", async () => {
    const ctx = createCtx({
      project: {
        _id: "project_1",
        userId: "user_owner",
        repoOwner: "acme",
        repoName: "docs",
        branch: "main",
      },
      draftDocs: [
        {
          _id: "clean_base",
          filePath: "base.mdx",
          body: "# Base",
          updatedAt: 20,
          contentVersion: 4,
          publishedProvenance: {
            authorityKind: "base",
            authorityBranch: "main",
            commitSha: "a".repeat(40),
            publishedUpdatedAt: 10,
            publishedContentVersion: 4,
          },
        },
        {
          _id: "clean_lane",
          filePath: "lane.mdx",
          body: "# Lane",
          updatedAt: 20,
          contentVersion: 2,
          publishedProvenance: {
            authorityKind: "lane",
            authorityBranch: "repopress/main/1",
            publishBranchId: "lane_1",
            commitSha: "b".repeat(40),
            publishedUpdatedAt: 10,
            publishedContentVersion: 2,
          },
        },
        {
          _id: "dirty",
          filePath: "dirty.mdx",
          body: "# Dirty",
          updatedAt: 20,
          contentVersion: 3,
          publishedProvenance: {
            authorityKind: "base",
            authorityBranch: "main",
            commitSha: "a".repeat(40),
            publishedUpdatedAt: 10,
            publishedContentVersion: 2,
          },
        },
      ],
    })

    const result = await (discardAll as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
    })

    expect(result.discardedDirtyDocIds).toEqual(["dirty"])
    expect(ctx.db.patch).not.toHaveBeenCalledWith("clean_base", expect.anything())
    expect(ctx.db.patch).not.toHaveBeenCalledWith("clean_lane", expect.anything())
    expect(ctx.db.patch).toHaveBeenCalledWith("dirty", expect.objectContaining({ body: undefined }))
  })

  it("does not overwrite a failed storage deletion with undone", async () => {
    const ctx = createCtx({
      project: {
        _id: "project_1",
        userId: "user_owner",
        repoOwner: "acme",
        repoName: "docs",
        branch: "main",
      },
      pendingMediaOps: [
        {
          _id: "media_1",
          projectId: "project_1",
          userId: "user_owner",
          repoPath: "/public/a.png",
          fileName: "a.png",
          mimeType: "image/png",
          sourceType: "convex",
          convexStorageId: "storage_1",
          status: "pending",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })
    ctx.storage.delete.mockRejectedValue(new Error("storage unavailable"))

    await (discardAll as any).handler(ctx, { projectId: "project_1", userId: "user_owner" })

    expect(ctx.db.patch).toHaveBeenCalledWith("media_1", expect.objectContaining({ status: "failed" }))
    expect(ctx.db.patch).not.toHaveBeenCalledWith("media_1", expect.objectContaining({ status: "undone" }))
  })

  it("deletes the document owned by an explicitly discarded pending create", async () => {
    const ctx = createCtx({
      project: {
        _id: "project_1",
        userId: "user_owner",
        repoOwner: "acme",
        repoName: "docs",
        branch: "main",
      },
      pendingOps: [
        {
          _id: "create_1",
          projectId: "project_1",
          opType: "create",
          filePath: "new.mdx",
          pathRepresentation: "content_relative_v1",
          status: "pending",
        },
      ],
      createdDocs: [
        {
          _id: "new_doc",
          projectId: "project_1",
          filePath: "new.mdx",
          pathRepresentation: "content_relative_v1",
          status: "draft",
          body: "# New",
          contentVersion: 1,
        },
      ],
    })

    await (discardAll as any).handler(ctx, { projectId: "project_1", userId: "user_owner" })

    expect(ctx.db.delete).toHaveBeenCalledWith("new_doc")
  })
})
