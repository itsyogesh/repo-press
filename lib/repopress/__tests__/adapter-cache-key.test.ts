import { describe, expect, it } from "vitest"
import { buildAdapterCacheKey } from "../adapter-cache"

describe("buildAdapterCacheKey", () => {
  it("produces distinct keys for different adapter roots", () => {
    const a = buildAdapterCacheKey("o", "r", "main", "mdx-components.tsx", "apps/docs", "sha1")
    const b = buildAdapterCacheKey("o", "r", "main", "mdx-components.tsx", "apps/marketing", "sha1")
    expect(a).not.toBe(b)
  })

  it("treats null root as a stable empty segment", () => {
    const a = buildAdapterCacheKey("o", "r", "main", "e.tsx", null, "sha1")
    const b = buildAdapterCacheKey("o", "r", "main", "e.tsx", null, "sha1")
    expect(a).toBe(b)
    expect(a).toContain("e.tsx::sha1")
  })
})
