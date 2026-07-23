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

import { listDirtyForProject, markPublishedSnapshot } from "@/convex/documents"
import { mintProjectAccessToken } from "@/lib/project-access-token"

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

function createCtx({
  get,
  patch = vi.fn(),
  draftDocs = [],
  approvedDocs = [],
}: {
  get: ReturnType<typeof vi.fn>
  patch?: ReturnType<typeof vi.fn>
  draftDocs?: Array<Record<string, unknown>>
  approvedDocs?: Array<Record<string, unknown>>
}) {
  let documentsCollectCount = 0
  return {
    db: {
      get,
      patch,
      insert: vi.fn(),
      delete: vi.fn(),
      query: vi.fn((table: string) => ({
        withIndex: () => ({
          first: vi.fn().mockResolvedValue(null),
          collect: vi.fn().mockImplementation(async () => {
            if (table !== "documents") return []
            documentsCollectCount += 1
            return documentsCollectCount === 1 ? draftDocs : approvedDocs
          }),
          filter: () => ({ first: vi.fn().mockResolvedValue(null) }),
        }),
      })),
    },
    scheduler: { runAfter: vi.fn() },
  } as any
}

describe("lane-synchronization provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    safeGetAuthUserMock.mockResolvedValue(null)
  })

  it("marks a document clean when it still matches the published snapshot", async () => {
    const patch = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce({ _id: "doc_1", projectId: "project_1", updatedAt: 5 })
      .mockResolvedValueOnce(project)

    const result = await (markPublishedSnapshot as any).handler(createCtx({ get, patch }), {
      id: "doc_1",
      githubSha: "blob-1",
      expectedUpdatedAt: 5,
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(result).toEqual({ synchronized: true })
    expect(patch).toHaveBeenCalledTimes(1)
    const [, patched] = patch.mock.calls[0]
    expect(patched.githubSha).toBe("blob-1")
    // Clean means the provenance marker equals the new updatedAt.
    expect(patched.lastPublishedUpdatedAt).toBe(patched.updatedAt)
  })

  it("refreshes only conflict state when the document was edited during publishing", async () => {
    const patch = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce({ _id: "doc_1", projectId: "project_1", updatedAt: 9 })
      .mockResolvedValueOnce(project)

    const result = await (markPublishedSnapshot as any).handler(createCtx({ get, patch }), {
      id: "doc_1",
      githubSha: "blob-1",
      expectedUpdatedAt: 5, // stale: a save landed mid-publish
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(result).toEqual({ synchronized: false })
    const [, patched] = patch.mock.calls[0]
    expect(patched.githubSha).toBe("blob-1")
    expect(patched.lastPublishedUpdatedAt).toBeUndefined()
  })

  it("excludes lane-synchronized documents from the dirty list until they are edited again", async () => {
    const get = vi.fn().mockResolvedValue(project)
    const ctx = createCtx({
      get,
      draftDocs: [
        // Clean: published snapshot still current.
        { _id: "doc_clean", body: "# A", frontmatter: null, updatedAt: 10, lastPublishedUpdatedAt: 10 },
        // Dirty: edited after the publish.
        { _id: "doc_edited", body: "# B", frontmatter: null, updatedAt: 12, lastPublishedUpdatedAt: 10 },
        // Dirty: never published.
        { _id: "doc_new", body: "# C", frontmatter: null, updatedAt: 3 },
      ],
    })

    const result = await (listDirtyForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(result.map((d: { _id: string }) => d._id)).toEqual(["doc_edited", "doc_new"])
  })
})
