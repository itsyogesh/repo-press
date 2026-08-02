import { describe, expect, it } from "vitest"
import { canServeDeploymentPath } from "@/lib/deployment-role"

describe("deployment role path policy", () => {
  it.each(["/", "/login", "/dashboard", "/dashboard/acme/docs", "/api/auth/get-session", "/api/github/tree"])(
    "rejects %s from a sandbox-only deployment",
    (pathname) => {
      expect(canServeDeploymentPath(pathname, "sandbox")).toBe(false)
    },
  )

  it.each([
    "/preview/sandbox",
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/esbuild.wasm",
    "/icon.svg",
    "/icon-light-32x32.png",
  ])("allows the sandbox document or required immutable asset %s", (pathname) => {
    expect(canServeDeploymentPath(pathname, "sandbox")).toBe(true)
  })

  it("does not allow a path that merely shares the sandbox prefix", () => {
    expect(canServeDeploymentPath("/preview/sandbox/admin", "sandbox")).toBe(false)
    expect(canServeDeploymentPath("/preview/sandboxx", "sandbox")).toBe(false)
  })

  it("does not constrain a normal Studio deployment", () => {
    expect(canServeDeploymentPath("/dashboard/acme/docs", undefined)).toBe(true)
    expect(canServeDeploymentPath("/api/github/publish-ops", "studio")).toBe(true)
  })
})
