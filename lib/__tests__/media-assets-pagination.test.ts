import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/convex/_generated/server", () => ({
  query: (definition: unknown) => definition,
  mutation: (definition: unknown) => definition,
}))

const { resolveProjectReaderMock } = vi.hoisted(() => ({
  resolveProjectReaderMock: vi.fn(),
}))

vi.mock("@/convex/lib/access", () => ({
  resolveProjectReader: resolveProjectReaderMock,
  resolveProjectAccess: vi.fn(),
}))

import { listByProjectPaginated } from "@/convex/mediaAssets"

describe("media asset pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveProjectReaderMock.mockResolvedValue({ userId: "user_1", role: "editor" })
  })

  it("keeps paging until it collects section-scoped results", async () => {
    const paginate = vi
      .fn()
      .mockResolvedValueOnce({
        page: [{ _id: "asset_other", filePath: "public/images/docs/guide.png" }],
        isDone: false,
        continueCursor: "cursor_2",
      })
      .mockResolvedValueOnce({
        page: [{ _id: "asset_blog", filePath: "public/images/blog/post-1.png" }],
        isDone: true,
        continueCursor: "",
      })

    const ctx = {
      db: {
        query: vi.fn(() => ({
          withIndex: vi.fn(() => ({
            order: vi.fn(() => ({
              paginate,
            })),
          })),
        })),
      },
    } as any

    const result = await (listByProjectPaginated as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_1",
      sectionSlug: "blog",
      limit: 24,
    })

    expect(paginate).toHaveBeenCalledTimes(2)
    expect(result.page).toEqual([{ _id: "asset_blog", filePath: "public/images/blog/post-1.png" }])
    expect(result.isDone).toBe(true)
  })
})
