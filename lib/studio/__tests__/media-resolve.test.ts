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

  it("includes userId in resolve URL when provided for PAT-mode previews", () => {
    expect(buildMediaResolveUrl("project_123", "public/images/hero.png", "user_1")).toBe(
      "/api/media/resolve?projectId=project_123&path=%2Fpublic%2Fimages%2Fhero.png&userId=user_1",
    )
  })

  it("resolves dot-relative media paths against the current file path", () => {
    expect(resolveStudioAssetUrl("./hero.png", "project_123", "user_1", "content/blog/post.mdx")).toBe(
      "/api/media/resolve?projectId=project_123&path=%2Fcontent%2Fblog%2Fhero.png&userId=user_1",
    )
  })

  it("resolves parent-relative media paths against the current file path", () => {
    expect(resolveStudioAssetUrl("../images/hero.png", "project_123", "user_1", "content/blog/post.mdx")).toBe(
      "/api/media/resolve?projectId=project_123&path=%2Fcontent%2Fimages%2Fhero.png&userId=user_1",
    )
  })

  it("resolves bare file names against the current file path", () => {
    expect(resolveStudioAssetUrl("hero.png", "project_123", "user_1", "content/blog/post.mdx")).toBe(
      "/api/media/resolve?projectId=project_123&path=%2Fimages%2Fblog%2Fpost%2Fhero.png&userId=user_1",
    )
  })

  it("keeps non-blog bare file names relative to their local directory", () => {
    expect(resolveStudioAssetUrl("hero.png", "project_123", "user_1", "content/docs/getting-started/intro.mdx")).toBe(
      "/api/media/resolve?projectId=project_123&path=%2Fcontent%2Fdocs%2Fgetting-started%2Fhero.png&userId=user_1",
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
