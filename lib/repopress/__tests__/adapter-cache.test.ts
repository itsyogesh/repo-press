import { afterEach, describe, expect, it } from "vitest"
import {
  buildAdapterCacheKey,
  clearAdapterCache,
  getCachedAdapter,
  invalidateAdapterCache,
  setCachedAdapter,
} from "@/lib/repopress/adapter-cache"

describe("adapter cache", () => {
  afterEach(async () => {
    await clearAdapterCache()
  })

  it("builds deterministic cache keys including source sha", () => {
    const key = buildAdapterCacheKey("acme", "docs", "main", "preview/adapter.tsx", "abc123")
    expect(key).toBe("acme/docs@main:preview/adapter.tsx:abc123")
  })

  it("stores and reads transpiled adapter code", async () => {
    const key = buildAdapterCacheKey("acme", "docs", "main", "preview/adapter.tsx", "sha-1")

    expect(await getCachedAdapter(key, "sha-1")).toBeNull()

    await setCachedAdapter({
      key,
      sourceSha: "sha-1",
      transpiledCode: "module.exports = {}",
    })

    await expect(getCachedAdapter(key, "sha-1")).resolves.toBe("module.exports = {}")
  })

  it("invalidates entries by key prefix", async () => {
    const keyA = buildAdapterCacheKey("acme", "docs", "main", "preview/a.tsx", "sha-a")
    const keyB = buildAdapterCacheKey("acme", "docs", "main", "preview/b.tsx", "sha-b")
    const keyOther = buildAdapterCacheKey("acme", "site", "main", "preview/c.tsx", "sha-c")

    await setCachedAdapter({ key: keyA, sourceSha: "sha-a", transpiledCode: "a" })
    await setCachedAdapter({ key: keyB, sourceSha: "sha-b", transpiledCode: "b" })
    await setCachedAdapter({ key: keyOther, sourceSha: "sha-c", transpiledCode: "c" })

    await invalidateAdapterCache("acme/docs@main:preview/")

    await expect(getCachedAdapter(keyA, "sha-a")).resolves.toBeNull()
    await expect(getCachedAdapter(keyB, "sha-b")).resolves.toBeNull()
    await expect(getCachedAdapter(keyOther, "sha-c")).resolves.toBe("c")
  })
})
