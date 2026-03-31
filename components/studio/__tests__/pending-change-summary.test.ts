import { describe, expect, it } from "vitest"

import { getPendingChangeSummary, hasDiscardableChanges } from "../pending-change-summary"

describe("pending change summary", () => {
  it("counts pending media alongside creates, deletes, and edits", () => {
    const summary = getPendingChangeSummary({
      pendingOps: [
        { _id: "op-create", opType: "create", filePath: "content/blog/new-post.mdx", status: "pending" },
        { _id: "op-delete", opType: "delete", filePath: "content/blog/old-post.mdx", status: "pending" },
      ],
      dirtyDocs: [
        { _id: "doc-create", filePath: "content/blog/new-post.mdx" },
        { _id: "doc-edit", filePath: "content/blog/edited-post.mdx" },
      ],
      pendingMediaOps: [
        {
          _id: "media-1",
          repoPath: "/public/images/blog/edited-post/hero.png",
          status: "pending",
          sourceFilePath: "content/blog/edited-post.mdx",
        },
      ],
    })

    expect(summary).toEqual({
      creates: 1,
      deletes: 1,
      edits: 1,
      media: 1,
      total: 4,
    })
  })

  it("treats media-only discard plans as discardable", () => {
    expect(
      hasDiscardableChanges({
        opIdsToUndo: [],
        dirtyDocIdsToDiscard: [],
        mediaRepoPathsToUndo: ["/public/images/blog/post/hero.png"],
        filePathsToReset: ["content/blog/post.mdx"],
      }),
    ).toBe(true)
  })
})
