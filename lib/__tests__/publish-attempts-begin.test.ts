import { beforeEach, describe, expect, it, vi } from "vitest"

const { safeGetAuthUserMock } = vi.hoisted(() => ({
  safeGetAuthUserMock: vi.fn(),
}))

vi.mock("@/convex/_generated/server", () => ({
  mutation: (definition: unknown) => definition,
  query: (definition: unknown) => definition,
  internalMutation: (definition: unknown) => definition,
  internalQuery: (definition: unknown) => definition,
  action: (definition: unknown) => definition,
}))

vi.mock("@/convex/auth", () => ({
  authComponent: {
    safeGetAuthUser: safeGetAuthUserMock,
  },
}))

import { begin } from "@/convex/publishAttempts"
import { mintProjectAccessToken } from "@/lib/project-access-token"

function createCtx(get: ReturnType<typeof vi.fn>, insert = vi.fn()) {
  return {
    db: {
      get,
      insert,
      patch: vi.fn(),
      delete: vi.fn(),
      query: vi.fn(() => ({
        withIndex: () => ({
          first: vi.fn().mockResolvedValue(null),
          filter: () => ({ first: vi.fn().mockResolvedValue(null) }),
        }),
      })),
    },
    scheduler: { runAfter: vi.fn() },
  } as any
}

async function patToken() {
  return mintProjectAccessToken({
    projectId: "project_1",
    userId: "user_owner",
    repoOwner: "acme",
    repoName: "docs-site",
    branch: "main",
  })
}

const project = { _id: "project_1", userId: "user_owner" }

const baseArgs = {
  projectId: "project_1",
  publishBranchId: "lane_1",
  branchName: "repopress/start",
  expectedHeadSha: "a".repeat(40),
  planDigest: "digest-1",
  operationPaths: ["content/a.mdx"],
  opIds: [],
  mediaOpIds: [],
  documentAssociations: [],
  deleteAssociations: [],
  userId: "user_owner",
}

describe("publishAttempts.begin transactional reference validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    safeGetAuthUserMock.mockResolvedValue(null)
  })

  it("inserts the attempt when the lane matches the project and branch name", async () => {
    const insert = vi.fn().mockResolvedValue("attempt_1")
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })

    const result = await (begin as any).handler(createCtx(get, insert), {
      ...baseArgs,
      projectAccessToken: await patToken(),
    })

    expect(result).toBe("attempt_1")
    expect(insert).toHaveBeenCalledWith(
      "publishAttempts",
      expect.objectContaining({ status: "committing", planDigest: "digest-1" }),
    )
  })

  it("rejects a lane belonging to another project", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_OTHER", branchName: "repopress/start" })

    await expect(
      (begin as any).handler(createCtx(get, insert), { ...baseArgs, projectAccessToken: await patToken() }),
    ).rejects.toThrow(/lane does not match/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects a lane whose branch name no longer matches the attempt", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/other" })

    await expect(
      (begin as any).handler(createCtx(get, insert), { ...baseArgs, projectAccessToken: await patToken() }),
    ).rejects.toThrow(/lane does not match/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects op references outside the project", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })
      .mockResolvedValueOnce({ _id: "op_1", projectId: "project_OTHER" })

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        opIds: ["op_1"],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/explorer op outside the project/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects document associations outside the project", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })
      .mockResolvedValueOnce({ _id: "doc_1", projectId: "project_OTHER" })

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        documentAssociations: [{ documentId: "doc_1", repoPath: "content/a.mdx" }],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/document outside the project/i)

    expect(insert).not.toHaveBeenCalled()
  })
})
