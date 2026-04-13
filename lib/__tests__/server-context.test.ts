import { beforeEach, describe, expect, it, vi } from "vitest"

const { convexQueryMock, mintServerQueryTokenMock } = vi.hoisted(() => ({
  convexQueryMock: vi.fn(),
  mintServerQueryTokenMock: vi.fn(),
}))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    url: string
    query = convexQueryMock

    constructor(url: string) {
      this.url = url
    }
  },
}))

vi.mock("@/lib/auth-server", () => ({
  fetchAuthQuery: vi.fn(),
  getPatAuthUserId: vi.fn(),
}))

vi.mock("@/lib/project-access-token", () => ({
  mintServerQueryToken: mintServerQueryTokenMock,
}))

import { fetchAuthQuery, getPatAuthUserId } from "@/lib/auth-server"
import { createServerQueryContext, resolveActingUserId } from "../server-context"

describe("server context helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud"
    mintServerQueryTokenMock.mockResolvedValue("server-query-token")
  })

  it("prefers the OAuth user id over the PAT fallback", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue({ _id: "oauth-user" } as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("pat-user")

    const actingUserId = await resolveActingUserId("gh-token")

    expect(actingUserId).toBe("oauth-user")
    expect(getPatAuthUserId).not.toHaveBeenCalled()
  })

  it("falls back to the PAT user id when there is no OAuth session", async () => {
    vi.mocked(fetchAuthQuery!).mockResolvedValue(null as never)
    vi.mocked(getPatAuthUserId).mockResolvedValue("pat-user")

    const actingUserId = await resolveActingUserId("gh-token")

    expect(actingUserId).toBe("pat-user")
    expect(getPatAuthUserId).toHaveBeenCalledWith("gh-token")
  })

  it("creates a server query context with a convex client and token", async () => {
    const context = await createServerQueryContext()

    expect(context.serverQueryToken).toBe("server-query-token")
    expect(context.convex.query).toBe(convexQueryMock)
    expect(context.convex.url).toBe("https://example.convex.cloud")
  })

  it("keeps building the mocked convex client when NEXT_PUBLIC_CONVEX_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL

    const context = await createServerQueryContext()

    expect(context.convex.url).toBe("")
    expect(context.serverQueryToken).toBe("server-query-token")
  })
})
