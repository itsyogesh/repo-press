import { describe, expect, it } from "vitest"
import {
  buildMediaResolveUrl,
  isStudioMediaResolveUrl,
  normalizeRepoMediaPath,
  resolveStudioAssetUrl,
} from "../media-resolve"

describe("media-resolve helpers", () => {
  it("normalizes repo-relative paths with a leading slash", () => {
    expect(normalizeRepoMediaPath("public/images/hero.png")).toBe("/public/images/hero.png")
    expect(normalizeRepoMediaPath("./public/images/hero.png")).toBe("/public/images/hero.png")
    expect(normalizeRepoMediaPath("/public/images/hero.png")).toBe("/public/images/hero.png")
  })

  it("builds auth-proxy URLs for studio previews", () => {
    expect(buildMediaResolveUrl("project_123", "public/images/hero.png")).toBe(
      "/api/media/resolve?projectId=project_123&path=%2Fpublic%2Fimages%2Fhero.png",
    )
  })

  it("keeps absolute URLs unchanged", () => {
    const absolute = "https://cdn.example.com/hero.png"
    expect(resolveStudioAssetUrl(absolute, "project_123")).toBe(absolute)
  })

  it("does not double-wrap studio media resolve URLs", () => {
    const alreadyResolved = "/api/media/resolve?projectId=project_123&path=%2Fpublic%2Fimages%2Fhero.png"
    expect(isStudioMediaResolveUrl(alreadyResolved)).toBe(true)
    expect(resolveStudioAssetUrl(alreadyResolved, "project_123")).toBe(alreadyResolved)
  })
})
