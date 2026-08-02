import { describe, expect, it } from "vitest"
import { resolveAuthOrigin } from "@/lib/auth-origin"

describe("resolveAuthOrigin", () => {
  it("derives one trusted application origin and the GitHub proxy callback", () => {
    expect(resolveAuthOrigin("https://repo-press.example/")).toEqual({
      githubCallbackURL: "https://repo-press.example/api/auth/callback/github",
      siteUrl: "https://repo-press.example",
      trustedOrigins: ["https://repo-press.example"],
    })
  })

  it("allows an HTTP localhost origin for local development", () => {
    expect(resolveAuthOrigin("http://localhost:3001")).toEqual({
      githubCallbackURL: "http://localhost:3001/api/auth/callback/github",
      siteUrl: "http://localhost:3001",
      trustedOrigins: ["http://localhost:3001"],
    })
  })

  it("rejects plain HTTP for non-local application origins", () => {
    expect(() => resolveAuthOrigin("http://repo-press.example")).toThrow(
      "SITE_URL must be an absolute HTTPS application origin or an HTTP localhost origin",
    )
  })

  it.each([
    undefined,
    "",
    "repo-press.example",
    "ftp://repo-press.example",
    "https://user:password@repo-press.example",
    "https://repo-press.example/app",
    "https://repo-press.example?preview=1",
    "https://repo-press.example#fragment",
  ])("rejects an invalid SITE_URL value %s", (value) => {
    expect(() => resolveAuthOrigin(value)).toThrow(
      "SITE_URL must be an absolute HTTPS application origin or an HTTP localhost origin",
    )
  })
})
