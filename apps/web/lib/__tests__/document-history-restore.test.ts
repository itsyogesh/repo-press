import { describe, expect, it } from "vitest"
import { buildRestoreVersionMutation } from "@/convex/documentHistory_restore"
import { isDocumentContentClean } from "@/convex/lib/documentCleanliness"

describe("buildRestoreVersionMutation", () => {
  it("snapshots current document content and patches to target history content", () => {
    const result = buildRestoreVersionMutation({
      documentId: "doc_123",
      currentBody: "# Current content",
      currentFrontmatter: { title: "Current title" },
      targetBody: "# Restored content",
      targetFrontmatter: { title: "Restored title" },
      editedBy: "user_123",
      historyCreatedAt: 1_700_000_000_000,
      now: 1_800_000_000_000,
      currentContentVersion: 7,
    })

    expect(result.historyInsert).toEqual({
      documentId: "doc_123",
      body: "# Current content",
      frontmatter: { title: "Current title" },
      editedBy: "user_123",
      message: "Restored to version from 2023-11-14T22:13:20.000Z",
      changeType: "patch",
      createdAt: 1_800_000_000_000,
    })

    expect(result.documentPatch).toEqual({
      body: "# Restored content",
      frontmatter: { title: "Restored title" },
      updatedAt: 1_800_000_000_000,
      contentVersion: 8,
    })
  })

  it("advances legacy and versioned content exactly once for body or frontmatter restores", () => {
    const legacy = buildRestoreVersionMutation({
      documentId: "legacy",
      currentBody: "same body",
      currentFrontmatter: { title: "Current" },
      targetBody: "same body",
      targetFrontmatter: { title: "Restored" },
      editedBy: "user_1",
      historyCreatedAt: 1,
      now: 2,
    })
    const versioned = buildRestoreVersionMutation({
      documentId: "versioned",
      currentBody: "current",
      targetBody: "restored",
      editedBy: "user_1",
      historyCreatedAt: 1,
      now: 2,
      currentContentVersion: 4,
    })

    expect(legacy.documentPatch.contentVersion).toBe(1)
    expect(versioned.documentPatch.contentVersion).toBe(5)
    expect(
      isDocumentContentClean({
        contentVersion: versioned.documentPatch.contentVersion,
        publishedProvenance: { publishedContentVersion: 4 },
      }),
    ).toBe(false)
  })

  it("supports restore when current or target frontmatter is missing", () => {
    const result = buildRestoreVersionMutation({
      documentId: "doc_456",
      currentBody: "current text",
      targetBody: "restored text",
      editedBy: "user_456",
      historyCreatedAt: 1_700_000_000_000,
      now: 1_800_000_000_000,
    })

    expect(result.historyInsert.frontmatter).toBeUndefined()
    expect(result.documentPatch.frontmatter).toBeUndefined()
    expect(result.historyInsert.body).toBe("current text")
    expect(result.documentPatch.body).toBe("restored text")
  })
})
