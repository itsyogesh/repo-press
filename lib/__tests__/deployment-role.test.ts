import { describe, expect, it } from "vitest"
import { canServeDeploymentRequest } from "@/lib/deployment-role"

describe("deployment role request policy", () => {
  it.each([
    "/",
    "/login",
    "/dashboard",
    "/dashboard/acme/docs",
    "/api/auth/get-session",
    "/api/github/tree",
    "/_next/image",
    "/dashboard/acme/repo/blob/private.png",
    "/blog/diagram.svg",
    "/secret.png",
  ])("rejects %s from a sandbox-only deployment", (pathname) => {
    expect(canServeDeploymentRequest(pathname, "GET", "sandbox")).toBe(false)
  })

  it.each([
    "/preview/sandbox",
    "/_next/static/chunks/app.js",
    "/esbuild.wasm",
    "/icon.svg",
    "/icon-light-32x32.png",
    "/icon-dark-32x32.png",
    "/apple-icon.png",
  ])("allows the sandbox document or required immutable asset %s", (pathname) => {
    expect(canServeDeploymentRequest(pathname, "GET", "sandbox")).toBe(true)
    expect(canServeDeploymentRequest(pathname, "HEAD", "sandbox")).toBe(true)
  })

  it.each([
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ])("rejects %s requests even for the sandbox document", (method) => {
    expect(canServeDeploymentRequest("/preview/sandbox", method, "sandbox")).toBe(false)
  })

  it("does not infer public access from an allowed asset's extension", () => {
    expect(canServeDeploymentRequest("/nested/icon.svg", "GET", "sandbox")).toBe(false)
    expect(canServeDeploymentRequest("/esbuild.wasm/extra", "GET", "sandbox")).toBe(false)
  })

  it("does not allow a path that merely shares the sandbox prefix", () => {
    expect(canServeDeploymentRequest("/preview/sandbox/admin", "GET", "sandbox")).toBe(false)
    expect(canServeDeploymentRequest("/preview/sandboxx", "GET", "sandbox")).toBe(false)
  })

  it("does not constrain a normal Studio deployment", () => {
    expect(canServeDeploymentRequest("/dashboard/acme/docs", "GET", undefined)).toBe(true)
    expect(canServeDeploymentRequest("/api/github/publish-ops", "POST", "studio")).toBe(true)
  })
})
