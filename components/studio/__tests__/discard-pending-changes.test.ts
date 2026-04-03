import { describe, expect, it } from "vitest"

import { getDiscardPlan } from "../discard-pending-changes"

describe("getDiscardPlan", () => {
  it("includes modified draft documents even when there are no pending explorer ops", () => {
    const plan = getDiscardPlan({
      pendingOps: [],
      dirtyDocs: [
        { _id: "doc-1", filePath: "content/blog/one.mdx" },
        { _id: "doc-2", filePath: "content/blog/two.mdx" },
      ],
    })

    expect(plan.opIdsToUndo).toEqual([])
    expect(plan.dirtyDocIdsToDiscard).toEqual(["doc-1", "doc-2"])
    expect(plan.filePathsToReset).toEqual(["content/blog/one.mdx", "content/blog/two.mdx"])
  })

  it("excludes dirty docs that belong to staged creates because those are removed by undoing the create op", () => {
    const plan = getDiscardPlan({
      pendingOps: [
        {
          _id: "op-1",
          opType: "create",
          filePath: "content/blog/new-file.mdx",
          status: "pending",
        },
        {
          _id: "op-2",
          opType: "delete",
          filePath: "content/blog/old-file.mdx",
          status: "pending",
        },
      ],
      dirtyDocs: [
        { _id: "doc-new", filePath: "content/blog/new-file.mdx" },
        { _id: "doc-edit", filePath: "content/blog/existing-file.mdx" },
      ],
    })

    expect(plan.opIdsToUndo).toEqual(["op-1", "op-2"])
    expect(plan.dirtyDocIdsToDiscard).toEqual(["doc-edit"])
    expect(plan.filePathsToReset).toEqual([
      "content/blog/new-file.mdx",
      "content/blog/old-file.mdx",
      "content/blog/existing-file.mdx",
    ])
  })

  it("includes pending media ops and reloads their source files on discard", () => {
    const plan = getDiscardPlan({
      pendingOps: [],
      dirtyDocs: [],
      pendingMediaOps: [
        {
          _id: "media-1",
          repoPath: "/public/images/blog/post/hero.png",
          status: "pending",
          sourceFilePath: "content/blog/post.mdx",
        },
        {
          _id: "media-2",
          repoPath: "/public/images/blog/other/cover.png",
          status: "pending",
          sourceFilePath: "content/blog/other.mdx",
        },
      ],
    } as any)

    expect((plan as any).mediaRepoPathsToUndo).toEqual([
      "/public/images/blog/post/hero.png",
      "/public/images/blog/other/cover.png",
    ])
    expect(plan.filePathsToReset).toEqual(["content/blog/post.mdx", "content/blog/other.mdx"])
  })
})
