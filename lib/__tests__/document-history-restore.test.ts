import { describe, expect, it } from "vitest"
import { buildRestoreVersionMutation } from "@/convex/documentHistory_restore"

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
    })
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
