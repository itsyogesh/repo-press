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

  it("does not skip section matches that spill past the requested page size", async () => {
    const paginate = vi
      .fn()
      .mockResolvedValueOnce({
        page: Array.from({ length: 20 }, (_, index) => ({
          _id: `asset_blog_${index}`,
          filePath: `public/images/blog/post-${index}.png`,
        })),
        isDone: false,
        continueCursor: "cursor_20",
      })
      .mockResolvedValueOnce({
        page: Array.from({ length: 4 }, (_, index) => ({
          _id: `asset_blog_more_${index}`,
          filePath: `public/images/blog/more-${index}.png`,
        })),
        isDone: false,
        continueCursor: "cursor_24",
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

    expect(result.page).toHaveLength(24)
    expect(result.continueCursor).toBe("cursor_24")
    expect(paginate.mock.calls[0]?.[0]).toEqual({ cursor: null, numItems: 24 })
    expect(paginate.mock.calls[1]?.[0]).toEqual({ cursor: "cursor_20", numItems: 4 })
  })

  it("rebuilds the Convex query for each section-scoped page fetch", async () => {
    const pages = [
      {
        page: [{ _id: "asset_other", filePath: "public/images/docs/guide.png" }],
        isDone: false,
        continueCursor: "cursor_2",
      },
      {
        page: [{ _id: "asset_blog", filePath: "public/images/blog/post-1.png" }],
        isDone: true,
        continueCursor: "",
      },
    ]

    let queryBuilds = 0
    const ctx = {
      db: {
        query: vi.fn(() => {
          const response = pages[queryBuilds]
          queryBuilds += 1
          let used = false

          return {
            withIndex: vi.fn(() => ({
              order: vi.fn(() => ({
                paginate: vi.fn(async () => {
                  if (used) {
                    throw new Error("A query can only be chained once and can't be chained after iteration begins.")
                  }
                  used = true
                  return response
                }),
              })),
            })),
          }
        }),
      },
    } as any

    const result = await (listByProjectPaginated as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_1",
      sectionSlug: "blog",
      limit: 24,
    })

    expect(result.page).toEqual([{ _id: "asset_blog", filePath: "public/images/blog/post-1.png" }])
    expect(ctx.db.query).toHaveBeenCalledTimes(2)
  })
})
