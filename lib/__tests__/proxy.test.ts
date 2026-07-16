import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { config, proxy } from "@/proxy"

describe("proxy.ts", () => {
  it("redirects unauthenticated dashboard requests to /login", () => {
    const request = new NextRequest("https://repo-press.dev/dashboard/acme/docs-site")
    const response = proxy(request)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://repo-press.dev/login")
  })

  it("does not treat a bare Better Auth session cookie as authenticated on /login", () => {
    const request = new NextRequest("https://repo-press.dev/login", {
      headers: {
        cookie: "better-auth.session_token=stale-session-token",
      },
    })
    const response = proxy(request)

    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("allows dashboard access when a Better Auth session cookie is present", () => {
    const request = new NextRequest("https://repo-press.dev/dashboard/acme/docs-site", {
      headers: {
        cookie: "better-auth.session_token=valid-session-token",
      },
    })
    const response = proxy(request)

    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("allows /login when only a Convex JWT cookie is present", () => {
    const request = new NextRequest("https://repo-press.dev/login", {
      headers: {
        cookie: "better-auth.convex_jwt=valid-jwt",
      },
    })
    const response = proxy(request)

    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("redirects /login to /dashboard when a PAT cookie is present", () => {
    const request = new NextRequest("https://repo-press.dev/login", {
      headers: {
        cookie: "github_pat=valid-pat",
      },
    })
    const response = proxy(request)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://repo-press.dev/dashboard")
  })

  it("still redirects the marketing root to /dashboard when a Convex JWT cookie is present", () => {
    const request = new NextRequest("https://repo-press.dev/", {
      headers: {
        cookie: "better-auth.convex_jwt=valid-jwt",
      },
    })
    const response = proxy(request)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://repo-press.dev/dashboard")
  })

  it("exports a static matcher config for login and dashboard routes", () => {
    expect(config).toEqual({
      matcher: ["/", "/login/:path*", "/dashboard/:path*"],
    })
  })
})
