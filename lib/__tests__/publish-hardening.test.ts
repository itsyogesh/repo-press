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

import { publish } from "@/convex/documents"

function createCtx(overrides?: {
  get?: ReturnType<typeof vi.fn>
  patch?: ReturnType<typeof vi.fn>
  insert?: ReturnType<typeof vi.fn>
  delete?: ReturnType<typeof vi.fn>
}) {
  return {
    db: {
      get: overrides?.get ?? vi.fn(),
      patch: overrides?.patch ?? vi.fn(),
      insert: overrides?.insert ?? vi.fn(),
      delete: overrides?.delete ?? vi.fn(),
    },
  } as any
}

describe("Publish mutation hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue({ _id: "user_owner" })
  })

  it("rejects publish when editedBy is spoofed", async () => {
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "doc_1",
          projectId: "project_1",
          status: "approved",
        })
        .mockResolvedValueOnce({ _id: "project_1", userId: "user_owner" }),
      patch: vi.fn(),
    })

    // Authenticated as user_owner, but trying to publish as user_other
    await expect(
      (publish as any).handler(ctx, {
        id: "doc_1",
        commitSha: "sha123",
        editedBy: "user_other",
      }),
    ).rejects.toThrow("Unauthorized: caller identity does not match userId")

    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it("rejects publish when not authenticated and no token", async () => {
    safeGetAuthUserMock.mockResolvedValue(null)
    const ctx = createCtx({
      get: vi.fn().mockResolvedValue({
        _id: "doc_1",
        projectId: "project_1",
        status: "approved",
      }),
    })

    await expect(
      (publish as any).handler(ctx, {
        id: "doc_1",
        commitSha: "sha123",
      }),
    ).rejects.toThrow("Unauthorized: Not authenticated")
  })

  it("allows publish when authenticated as the owner", async () => {
    const ctx = createCtx({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "doc_1",
          projectId: "project_1",
          status: "approved",
        })
        .mockResolvedValueOnce({ _id: "project_1", userId: "user_owner" }),
      patch: vi.fn(),
    })

    await (publish as any).handler(ctx, {
      id: "doc_1",
      commitSha: "sha123",
      editedBy: "user_owner",
    })

    expect(ctx.db.patch).toHaveBeenCalledWith("doc_1", expect.objectContaining({ status: "published" }))
  })
})
