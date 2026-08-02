import { afterEach, describe, expect, it, vi } from "vitest"

const originalSiteUrl = process.env.SITE_URL

describe("Convex Better Auth registration", () => {
  afterEach(() => {
    vi.resetModules()
    if (originalSiteUrl === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = originalSiteUrl
  })

  it("allows the empty static registration context without deployment environment variables", async () => {
    delete process.env.SITE_URL
    const { createAuth } = await import("@/convex/auth")

    expect(() => createAuth({} as never)).not.toThrow()
  })

  it("still fails closed when a runtime context has no SITE_URL", async () => {
    delete process.env.SITE_URL
    const { createAuth } = await import("@/convex/auth")

    expect(() => createAuth({ runQuery: vi.fn() } as never)).toThrow(
      "SITE_URL must be an absolute HTTPS application origin or an HTTP localhost origin",
    )
  })
})
