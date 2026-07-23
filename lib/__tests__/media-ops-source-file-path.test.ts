import { beforeEach, describe, expect, it, vi } from "vitest"

const { safeGetAuthUserMock } = vi.hoisted(() => ({
  safeGetAuthUserMock: vi.fn(),
}))

vi.mock("@/convex/_generated/server", () => ({
  mutation: (definition: unknown) => definition,
  query: (definition: unknown) => definition,
  internalMutation: (definition: unknown) => definition,
}))

vi.mock("@/convex/auth", () => ({
  authComponent: {
    safeGetAuthUser: safeGetAuthUserMock,
  },
}))

import { stage } from "@/convex/mediaOps"

describe("mediaOps.stage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue({ _id: "user_owner" })
  })

  it("updates sourceFilePath when re-staging an existing media op", async () => {
    const patch = vi.fn()
    const ctx = {
      db: {
        get: vi.fn().mockResolvedValue({ _id: "project_1", userId: "user_owner" }),
        patch,
        insert: vi.fn(),
        query: vi.fn(() => ({
          withIndex: () => ({
            // No publish attempt is at the commit boundary in this scenario.
            first: vi.fn().mockResolvedValue(null),
            filter: () => ({
              first: vi.fn().mockResolvedValue({
                _id: "media_op_1",
                projectId: "project_1",
                repoPath: "/public/images/blog/post/hero.png",
                status: "pending",
              }),
            }),
          }),
        })),
      },
    } as any

    await (stage as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      repoPath: "/public/images/blog/post/hero.png",
      fileName: "hero.png",
      mimeType: "image/png",
      sizeBytes: 1234,
      sourceFilePath: "content/blog/post.mdx",
      sourceType: "blob",
      blobUrl: "https://blob.example/hero.png",
    })

    expect(patch).toHaveBeenCalledWith(
      "media_op_1",
      expect.objectContaining({
        sourceFilePath: "content/blog/post.mdx",
      }),
    )
  })
})
