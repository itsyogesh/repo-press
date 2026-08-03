import { describe, expect, it } from "vitest"
import { getDocumentHydrationKey } from "../studio-layout"

describe("getDocumentHydrationKey", () => {
  it("changes when a fresher Convex document revision arrives for the same file", () => {
    const stale = getDocumentHydrationKey({ _id: "doc_1", updatedAt: 100, contentVersion: 1 }, "content/blog/page.mdx")
    const fresh = getDocumentHydrationKey({ _id: "doc_1", updatedAt: 200, contentVersion: 2 }, "content/blog/page.mdx")

    expect(fresh).not.toBe(stale)
  })

  it("is stable for repeat renders of the same revision", () => {
    const document = { _id: "doc_1", updatedAt: 100, contentVersion: 1 }

    expect(getDocumentHydrationKey(document, "content/blog/page.mdx")).toBe(
      getDocumentHydrationKey(document, "content/blog/page.mdx"),
    )
  })
})
