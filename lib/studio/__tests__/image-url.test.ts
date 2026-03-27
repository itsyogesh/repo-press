import { describe, expect, it } from "vitest"

import { isSafeImageSrc, normalizeExternalImageUrl } from "../image-url"

describe("image-url helpers", () => {
  it("allows repo-relative image paths", () => {
    expect(isSafeImageSrc("/public/images/hero.png")).toBe(true)
    expect(isSafeImageSrc("./hero.png")).toBe(true)
    expect(isSafeImageSrc("../images/hero.png")).toBe(true)
  })

  it("normalizes bare external image URLs to https", () => {
    expect(normalizeExternalImageUrl("cdn.example.com/hero.png")).toBe("https://cdn.example.com/hero.png")
  })

  it("accepts safe external image URLs", () => {
    expect(isSafeImageSrc("https://cdn.example.com/hero.png")).toBe(true)
    expect(isSafeImageSrc("cdn.example.com/hero.png")).toBe(true)
  })

  it("rejects dangerous protocols", () => {
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false)
    expect(isSafeImageSrc("data:text/html,hello")).toBe(false)
    expect(isSafeImageSrc("file:///etc/passwd")).toBe(false)
  })
})
