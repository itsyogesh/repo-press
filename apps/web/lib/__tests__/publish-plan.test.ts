import { describe, expect, it } from "vitest"
import {
  buildPublishOperationDescriptors,
  commitMessageCarriesAttempt,
  computePublishPlanDigest,
  formatPublishAttemptTrailer,
  type PublishPlan,
} from "@/lib/publish-plan"

const basePlan: PublishPlan = {
  branchName: "repopress/hello",
  expectedHeadSha: "a".repeat(40),
  operationDescriptors: [
    { path: "content/b.mdx", action: "update", expectedBlobSha: "b".repeat(40) },
    { path: "content/a.mdx", action: "create", expectedBlobSha: "a".repeat(40) },
    { path: "content/c.mdx", action: "delete" },
  ],
  opIds: ["op_2", "op_1"],
  mediaOpIds: ["media_1"],
  deleteAssociations: [{ opId: "op_2", documentId: "doc_2", expectedUpdatedAt: 5 }],
}

describe("computePublishPlanDigest", () => {
  it("is deterministic under array reordering", () => {
    const reordered: PublishPlan = {
      ...basePlan,
      operationDescriptors: [...basePlan.operationDescriptors].reverse(),
      opIds: [...basePlan.opIds].reverse(),
    }
    expect(computePublishPlanDigest(reordered)).toBe(computePublishPlanDigest(basePlan))
  })

  it("changes when the expected head changes", () => {
    expect(computePublishPlanDigest({ ...basePlan, expectedHeadSha: "b".repeat(40) })).not.toBe(
      computePublishPlanDigest(basePlan),
    )
  })

  it("changes when an operation's expected blob changes", () => {
    const changed: PublishPlan = {
      ...basePlan,
      operationDescriptors: basePlan.operationDescriptors.map((operation) =>
        operation.path === "content/a.mdx" ? { ...operation, expectedBlobSha: "c".repeat(40) } : operation,
      ),
    }
    expect(computePublishPlanDigest(changed)).not.toBe(computePublishPlanDigest(basePlan))
  })

  it("changes when the lane changes", () => {
    expect(computePublishPlanDigest({ ...basePlan, branchName: "repopress/other" })).not.toBe(
      computePublishPlanDigest(basePlan),
    )
  })

  it("rejects malformed durable descriptors before hashing the plan", () => {
    expect(() =>
      computePublishPlanDigest({
        ...basePlan,
        operationDescriptors: [{ path: "content/a.mdx", action: "delete", expectedBlobSha: "a".repeat(40) } as never],
      }),
    ).toThrow(/delete.*SHA/i)
    expect(() =>
      computePublishPlanDigest({
        ...basePlan,
        operationDescriptors: [
          { path: "content/a.mdx", action: "create", expectedBlobSha: "a".repeat(40) },
          { path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) },
        ],
      }),
    ).toThrow(/duplicate/i)
  })
})

describe("buildPublishOperationDescriptors", () => {
  it("hashes the exact UTF-8 and decoded base64 bytes as Git blobs", () => {
    expect(
      buildPublishOperationDescriptors([
        { path: "content/hello.mdx", action: "update", content: "hello\n", contentEncoding: "utf-8" },
        { path: "public/logo.bin", action: "create", content: "AAEC/w==", contentEncoding: "base64" },
        { path: "content/old.mdx", action: "delete" },
      ]),
    ).toEqual([
      { path: "content/hello.mdx", action: "update", expectedBlobSha: "ce013625030ba8dba906f756967f9e9ca394464a" },
      { path: "public/logo.bin", action: "create", expectedBlobSha: "f971a5e28b6c4cb237ca3c7349e33bb600dbc907" },
      { path: "content/old.mdx", action: "delete" },
    ])
  })

  it("uses an existing blob SHA without rehashing bytes", () => {
    expect(
      buildPublishOperationDescriptors([{ path: "public/logo.png", action: "update", blobSha: "f".repeat(40) }]),
    ).toEqual([{ path: "public/logo.png", action: "update", expectedBlobSha: "f".repeat(40) }])
  })

  it("rejects non-canonical duplicate paths and malformed write bytes", () => {
    expect(() =>
      buildPublishOperationDescriptors([
        { path: "content/Cafe\u0301.mdx", action: "create", content: "one" },
        { path: "content/Café.mdx", action: "update", content: "two" },
      ]),
    ).toThrow(/canonical|duplicate/i)
    expect(() =>
      buildPublishOperationDescriptors([
        { path: "public/logo.bin", action: "create", content: "not base64!", contentEncoding: "base64" },
      ]),
    ).toThrow(/base64/i)
  })

  it("rejects paths outside the exact Git batch path policy", () => {
    for (const path of [`content/${"é".repeat(2_050)}.mdx`, "content/control\u0001.mdx", "content/bidi\u202e.mdx"]) {
      expect(() => buildPublishOperationDescriptors([{ path, action: "create", content: "safe" }])).toThrow(/path/i)
    }
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
