import { describe, expect, it, vi } from "vitest"

const { getSessionCookieMock } = vi.hoisted(() => ({
  getSessionCookieMock: vi.fn(),
}))

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: getSessionCookieMock,
}))

import { NextRequest } from "next/server"
import { config, proxy } from "@/proxy"

describe("proxy.ts", () => {
  it("redirects unauthenticated dashboard requests to /login", () => {
    getSessionCookieMock.mockReturnValue(null)

    const request = new NextRequest("https://repo-press.dev/dashboard/acme/docs-site")
    const response = proxy(request)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://repo-press.dev/login")
  })

  it("exports a static matcher config for login and dashboard routes", () => {
    expect(config).toEqual({
      matcher: ["/", "/login/:path*", "/dashboard/:path*"],
    })
  })
})
