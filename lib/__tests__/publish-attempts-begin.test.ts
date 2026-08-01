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

const project = { _id: "project_1", userId: "user_owner", contentRoot: "content" }

const baseArgs = {
  projectId: "project_1",
  publishBranchId: "lane_1",
  branchName: "repopress/start",
  expectedHeadSha: "a".repeat(40),
  planDigest: "d".repeat(64),
  operationDescriptors: [{ path: "content/a.mdx", action: "update", expectedBlobSha: "b".repeat(40) }],
  opIds: [],
  mediaAssociations: [],
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
      .mockResolvedValueOnce({
        _id: "doc_1",
        projectId: "project_1",
        filePath: "a.mdx",
        pathRepresentation: "content_relative_v1",
        updatedAt: 5,
      })

    const result = await (begin as any).handler(createCtx(get, insert), {
      ...baseArgs,
      documentAssociations: [{ documentId: "doc_1", repoPath: "content/a.mdx", expectedUpdatedAt: 5 }],
      projectAccessToken: await patToken(),
    })

    expect(result).toBe("attempt_1")
    expect(insert).toHaveBeenCalledWith(
      "publishAttempts",
      expect.objectContaining({
        status: "committing",
        planDigest: "d".repeat(64),
        operationDescriptors: baseArgs.operationDescriptors,
        operationPaths: ["content/a.mdx"],
      }),
    )
  })

  it("rejects an operation descriptor that has no owning persisted association", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/descriptor.*association/i)

    expect(insert).not.toHaveBeenCalled()
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

  it("persists canonical explorer associations for direct cleanup by ID", async () => {
    const insert = vi.fn().mockResolvedValue("attempt_1")
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })
      .mockResolvedValueOnce({
        _id: "op_1",
        projectId: "project_1",
        opType: "create",
        filePath: "guides/a.mdx",
        pathRepresentation: "content_relative_v1",
        status: "pending",
        updatedAt: 17,
      })

    await (begin as any).handler(createCtx(get, insert), {
      ...baseArgs,
      operationDescriptors: [{ path: "content/guides/a.mdx", action: "create", expectedBlobSha: "b".repeat(40) }],
      opIds: ["op_1"],
      projectAccessToken: await patToken(),
    })

    expect(insert).toHaveBeenCalledWith(
      "publishAttempts",
      expect.objectContaining({
        explorerAssociations: [{ opId: "op_1", repoPath: "content/guides/a.mdx", expectedUpdatedAt: 17 }],
      }),
    )
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
        documentAssociations: [{ documentId: "doc_1", repoPath: "content/a.mdx", expectedUpdatedAt: 5 }],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/document outside the project/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects a document edited or discarded after planning (stale updatedAt)", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })
      .mockResolvedValueOnce({
        _id: "doc_1",
        projectId: "project_1",
        filePath: "a.mdx",
        pathRepresentation: "content_relative_v1",
        updatedAt: 6, // saved again after planning
      })

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        documentAssociations: [{ documentId: "doc_1", repoPath: "content/a.mdx", expectedUpdatedAt: 5 }],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/edited or discarded/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects a document whose resolved path no longer matches the planned association", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })
      .mockResolvedValueOnce({
        _id: "doc_1",
        projectId: "project_1",
        filePath: "renamed.mdx",
        pathRepresentation: "content_relative_v1",
        updatedAt: 5,
      })

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        documentAssociations: [{ documentId: "doc_1", repoPath: "content/a.mdx", expectedUpdatedAt: 5 }],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/path no longer matches/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects an operation that is no longer pending (undone after planning)", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })
      .mockResolvedValueOnce({
        _id: "op_1",
        projectId: "project_1",
        opType: "create",
        filePath: "a.mdx",
        pathRepresentation: "content_relative_v1",
        status: "undone",
      })

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        opIds: ["op_1"],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/no longer pending/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects a delete association whose op is not an included pending delete", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        // op_missing is not in opIds at all
        deleteAssociations: [{ opId: "op_missing", documentId: "doc_1", expectedUpdatedAt: 5 }],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/pending delete operation included in this attempt/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects a media upload replaced in place after planning (versioned association)", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })
      .mockResolvedValueOnce({
        _id: "media_1",
        projectId: "project_1",
        repoPath: "/public/uploads/pic.png",
        status: "pending",
        updatedAt: 9, // stage() replaced the bytes after planning
      })

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        operationDescriptors: [{ path: "public/uploads/pic.png", action: "create", expectedBlobSha: "b".repeat(40) }],
        mediaAssociations: [{ mediaOpId: "media_1", repoPath: "public/uploads/pic.png", expectedUpdatedAt: 5 }],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/media upload was replaced/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects a media upload whose repoPath no longer matches the planned association", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })
      .mockResolvedValueOnce({
        _id: "media_1",
        projectId: "project_1",
        repoPath: "/public/uploads/moved.png",
        status: "pending",
        updatedAt: 5,
      })

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        operationDescriptors: [{ path: "public/uploads/pic.png", action: "create", expectedBlobSha: "b".repeat(40) }],
        mediaAssociations: [{ mediaOpId: "media_1", repoPath: "public/uploads/pic.png", expectedUpdatedAt: 5 }],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/media upload path no longer matches/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("persists a leading-slash media URL as the canonical Git descriptor path", async () => {
    const insert = vi.fn().mockResolvedValue("attempt_1")
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })
      .mockResolvedValueOnce({
        _id: "media_1",
        projectId: "project_1",
        repoPath: "/public/uploads/pic.png",
        status: "pending",
        updatedAt: 5,
      })

    await (begin as any).handler(createCtx(get, insert), {
      ...baseArgs,
      operationDescriptors: [{ path: "public/uploads/pic.png", action: "create", expectedBlobSha: "b".repeat(40) }],
      mediaAssociations: [{ mediaOpId: "media_1", repoPath: "public/uploads/pic.png", expectedUpdatedAt: 5 }],
      projectAccessToken: await patToken(),
    })

    expect(insert).toHaveBeenCalledWith(
      "publishAttempts",
      expect.objectContaining({
        mediaAssociations: [{ mediaOpId: "media_1", repoPath: "public/uploads/pic.png", expectedUpdatedAt: 5 }],
      }),
    )
  })

  it("rejects an association whose canonical path has no operation descriptor", async () => {
    const insert = vi.fn()
    const get = vi.fn().mockResolvedValueOnce(project)

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        documentAssociations: [{ documentId: "doc_1", repoPath: "content/unplanned.mdx", expectedUpdatedAt: 5 }],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/association.*descriptor/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects duplicate operation references", async () => {
    const insert = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        opIds: ["op_1", "op_1"],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/duplicate operation references/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("accepts a well-formed content revision and stores it on the association", async () => {
    const insert = vi.fn().mockResolvedValue("attempt_1")
    const get = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ _id: "lane_1", projectId: "project_1", branchName: "repopress/start" })
      .mockResolvedValueOnce({
        _id: "doc_1",
        projectId: "project_1",
        filePath: "a.mdx",
        pathRepresentation: "content_relative_v1",
        updatedAt: 5,
      })

    await (begin as any).handler(createCtx(get, insert), {
      ...baseArgs,
      documentAssociations: [
        { documentId: "doc_1", repoPath: "content/a.mdx", expectedUpdatedAt: 5, contentRevision: "c".repeat(64) },
      ],
      projectAccessToken: await patToken(),
    })

    expect(insert).toHaveBeenCalledWith(
      "publishAttempts",
      expect.objectContaining({
        documentAssociations: [expect.objectContaining({ contentRevision: "c".repeat(64) })],
      }),
    )
  })

  it("rejects a malformed content revision", async () => {
    const insert = vi.fn()
    const get = vi.fn().mockResolvedValue(project)

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        documentAssociations: [
          { documentId: "doc_1", repoPath: "content/a.mdx", expectedUpdatedAt: 5, contentRevision: "not-a-digest" },
        ],
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/content revision must be a 64-hex digest/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects malformed digests and out-of-bounds arrays", async () => {
    const insert = vi.fn()
    const get = vi.fn().mockResolvedValue(project)

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        planDigest: "not-a-digest",
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/64-hex digest/i)

    await expect(
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        opIds: Array.from({ length: 501 }, (_v, i) => `op_${i}`),
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/staged operation bounds/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects duplicate, non-canonical, and malformed operation descriptors", async () => {
    const insert = vi.fn()
    const get = vi.fn().mockResolvedValue(project)
    const invoke = (operationDescriptors: unknown[]) =>
      (begin as any).handler(createCtx(get, insert), {
        ...baseArgs,
        operationDescriptors,
        projectAccessToken: awaitToken,
      })
    const awaitToken = await patToken()

    await expect(invoke([])).rejects.toThrow(/descriptor/i)
    await expect(
      invoke([
        { path: "content/a.mdx", action: "create", expectedBlobSha: "a".repeat(40) },
        { path: "content/a.mdx", action: "delete" },
      ]),
    ).rejects.toThrow(/duplicate/i)
    await expect(
      invoke([{ path: "content/./a.mdx", action: "create", expectedBlobSha: "a".repeat(40) }]),
    ).rejects.toThrow(/path/i)
    await expect(invoke([{ path: "content/a.mdx", action: "update", expectedBlobSha: "not-a-sha" }])).rejects.toThrow(
      /blob SHA/i,
    )
    await expect(
      invoke([{ path: "content/a.mdx", action: "delete", expectedBlobSha: "a".repeat(40) }]),
    ).rejects.toThrow(/delete.*SHA/i)
    for (const path of [`content/${"é".repeat(2_050)}.mdx`, "content/control\u0001.mdx", "content/bidi\u202e.mdx"]) {
      await expect(invoke([{ path, action: "create", expectedBlobSha: "a".repeat(40) }])).rejects.toThrow(/path/i)
    }

    expect(insert).not.toHaveBeenCalled()
  })
})
