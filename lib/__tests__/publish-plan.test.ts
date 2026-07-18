import { describe, expect, it } from "vitest"
import {
  commitMessageCarriesAttempt,
  computePublishPlanDigest,
  formatPublishAttemptTrailer,
  type PublishPlan,
} from "@/lib/publish-plan"

const basePlan: PublishPlan = {
  branchName: "repopress/hello",
  expectedHeadSha: "a".repeat(40),
  operations: [
    { path: "content/b.mdx", action: "update", contentDigest: "digest-b" },
    { path: "content/a.mdx", action: "create", contentDigest: "digest-a" },
    { path: "content/c.mdx", action: "delete", contentDigest: null },
  ],
  opIds: ["op_2", "op_1"],
  mediaOpIds: ["media_1"],
  deleteAssociations: [{ opId: "op_2", documentId: "doc_2", expectedUpdatedAt: 5 }],
}

describe("computePublishPlanDigest", () => {
  it("is deterministic under array reordering", () => {
    const reordered: PublishPlan = {
      ...basePlan,
      operations: [...basePlan.operations].reverse(),
      opIds: [...basePlan.opIds].reverse(),
    }
    expect(computePublishPlanDigest(reordered)).toBe(computePublishPlanDigest(basePlan))
  })

  it("changes when the expected head changes", () => {
    expect(computePublishPlanDigest({ ...basePlan, expectedHeadSha: "b".repeat(40) })).not.toBe(
      computePublishPlanDigest(basePlan),
    )
  })

  it("changes when an operation's content digest changes", () => {
    const changed: PublishPlan = {
      ...basePlan,
      operations: basePlan.operations.map((operation) =>
        operation.path === "content/a.mdx" ? { ...operation, contentDigest: "digest-a2" } : operation,
      ),
    }
    expect(computePublishPlanDigest(changed)).not.toBe(computePublishPlanDigest(basePlan))
  })

  it("changes when the lane changes", () => {
    expect(computePublishPlanDigest({ ...basePlan, branchName: "repopress/other" })).not.toBe(
      computePublishPlanDigest(basePlan),
    )
  })
})

describe("attempt trailer", () => {
  it("round-trips through a commit message", () => {
    const digest = computePublishPlanDigest(basePlan)
    const message = `chore(content): 1 updated via RepoPress\n\n${formatPublishAttemptTrailer(digest)}`
    expect(commitMessageCarriesAttempt(message, digest)).toBe(true)
    expect(commitMessageCarriesAttempt(message, "f".repeat(64))).toBe(false)
  })
})
