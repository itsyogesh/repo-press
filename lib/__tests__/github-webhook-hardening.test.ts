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
})
