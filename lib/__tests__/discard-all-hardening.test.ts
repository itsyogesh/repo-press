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
}: {
  project: Record<string, unknown>
  pendingOps?: Record<string, unknown>[]
  pendingMediaOps?: Record<string, unknown>[]
  draftDocs?: Record<string, unknown>[]
  approvedDocs?: Record<string, unknown>[]
}) {
  let documentsCollectCount = 0

  return {
    db: {
      get: vi.fn().mockResolvedValue(project),
      patch: vi.fn(),
      delete: vi.fn(),
      query: vi.fn((tableName: string) => {
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
          documentsCollectCount += 1
          const rows = documentsCollectCount === 1 ? draftDocs : approvedDocs
          return {
            withIndex: () => ({
              collect: vi.fn().mockResolvedValue(rows),
              first: vi.fn().mockResolvedValue(null),
            }),
          }
        }

        throw new Error(`Unexpected query table: ${tableName}`)
      }),
    },
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
})
