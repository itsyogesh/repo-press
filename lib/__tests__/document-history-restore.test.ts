import { describe, expect, it } from "vitest"
import { buildRestoreVersionMutation } from "@/convex/documentHistory-restore"

describe("buildRestoreVersionMutation", () => {
  it("copies history content into both insert and patch payloads", () => {
    const result = buildRestoreVersionMutation({
      documentId: "doc_123",
      body: "# Restored content",
      frontmatter: { title: "Restored title" },
      editedBy: "user_123",
      historyCreatedAt: 1_700_000_000_000,
      now: 1_800_000_000_000,
    })

    expect(result.historyInsert).toEqual({
      documentId: "doc_123",
      body: "# Restored content",
      frontmatter: { title: "Restored title" },
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

  it("supports history entries without frontmatter", () => {
    const result = buildRestoreVersionMutation({
      documentId: "doc_456",
      body: "plain text",
      editedBy: "user_456",
      historyCreatedAt: 1_700_000_000_000,
      now: 1_800_000_000_000,
    })

    expect(result.historyInsert.frontmatter).toBeUndefined()
    expect(result.documentPatch.frontmatter).toBeUndefined()
  })
})
