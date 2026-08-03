import { NextRequest } from "next/server"
import { afterEach, describe, expect, it } from "vitest"
import { config, proxy } from "@/proxy"

afterEach(() => {
  delete process.env.REPOPRESS_DEPLOYMENT_ROLE
})

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

  it("allows dashboard requests authenticated by the secure production Convex JWT cookie", () => {
    const request = new NextRequest("https://repo-press.dev/dashboard", {
      headers: {
        cookie: "__Secure-better-auth.convex_jwt=valid-production-jwt",
      },
    })
    const response = proxy(request)

    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("does not send documentation routes through an auth redirect", () => {
    const response = proxy(new NextRequest("https://repopress.org/docs/platform/architecture"))

    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("returns 404 for application and API routes in a sandbox-only deployment", () => {
    process.env.REPOPRESS_DEPLOYMENT_ROLE = "sandbox"

    for (const pathname of [
      "/",
      "/login",
      "/dashboard/acme/docs",
      "/api/auth/get-session",
      "/api/github/tree",
      "/_next/image",
      "/dashboard/acme/repo/blob/private.png",
      "/blog/diagram.svg",
    ]) {
      const response = proxy(new NextRequest(`https://preview.repo-press.dev${pathname}`))

      expect(response.status, pathname).toBe(404)
      expect(response.headers.get("location"), pathname).toBeNull()
    }
  })

  it("allows the exact sandbox route through without authentication", () => {
    process.env.REPOPRESS_DEPLOYMENT_ROLE = "sandbox"
    const response = proxy(new NextRequest("https://preview.repo-press.dev/preview/sandbox"))

    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it.each([
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ])("returns 404 for %s requests to the sandbox document", (method) => {
    process.env.REPOPRESS_DEPLOYMENT_ROLE = "sandbox"
    const response = proxy(
      new NextRequest("https://preview.repo-press.dev/preview/sandbox", {
        method,
      }),
    )

    expect(response.status).toBe(404)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("exports a static matcher that covers application and API routes while excluding immutable assets", () => {
    expect(config).toEqual({
      matcher: ["/((?!_next/static).*)"],
    })
    const matcher = new RegExp(`^${config.matcher[0]}$`)

    for (const pathname of ["/dashboard/acme/repo/blob/private.png", "/blog/diagram.svg", "/preview/sandbox"]) {
      expect(matcher.test(pathname), pathname).toBe(true)
    }

    expect(matcher.test("/_next/static/chunks/app.js")).toBe(false)
  })
})
