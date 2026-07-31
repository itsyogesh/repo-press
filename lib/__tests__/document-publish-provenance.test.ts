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
const CONTENT_REVISION = "c".repeat(64)

function snapshotArgs(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc_1",
    githubSha: "blob-1",
    publishBranchId: "lane_1",
    commitSha: "commit-1",
    contentRevision: CONTENT_REVISION,
    expectedUpdatedAt: 5,
    userId: "user_owner",
    ...overrides,
  }
}

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

  it("records lane/commit/revision provenance without touching updatedAt when the snapshot is current", async () => {
    const patch = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce({ _id: "doc_1", projectId: "project_1", updatedAt: 5 })
      .mockResolvedValueOnce(project)

    const result = await (markPublishedSnapshot as any).handler(createCtx({ get, patch }), {
      ...snapshotArgs(),
      projectAccessToken: await patToken(),
    })

    expect(result).toEqual({ synchronized: true })
    expect(patch).toHaveBeenCalledTimes(1)
    const [, patched] = patch.mock.calls[0]
    expect(patched).toEqual({
      githubSha: "blob-1",
      publishedProvenance: {
        publishBranchId: "lane_1",
        commitSha: "commit-1",
        contentRevision: CONTENT_REVISION,
        publishedUpdatedAt: 5,
      },
    })
    // The whole idempotency design: recording provenance never bumps
    // updatedAt, so cleanliness (publishedUpdatedAt === updatedAt) is
    // stable across replays.
    expect(patched.updatedAt).toBeUndefined()
  })

  it("replays the same lane/commit/revision association as a no-op", async () => {
    const patch = vi.fn()
    const alreadyStamped = {
      _id: "doc_1",
      projectId: "project_1",
      updatedAt: 5,
      publishedProvenance: {
        publishBranchId: "lane_1",
        commitSha: "commit-1",
        contentRevision: CONTENT_REVISION,
        publishedUpdatedAt: 5,
      },
    }
    const get = vi.fn().mockResolvedValueOnce(alreadyStamped).mockResolvedValueOnce(project)

    const result = await (markPublishedSnapshot as any).handler(createCtx({ get, patch }), {
      ...snapshotArgs(),
      projectAccessToken: await patToken(),
    })

    // The retry patches values identical to what is already stored - the
    // document stays clean, never falsely dirty.
    expect(result).toEqual({ synchronized: true })
    const [, patched] = patch.mock.calls[0]
    expect(patched.publishedProvenance).toEqual(alreadyStamped.publishedProvenance)
    expect(patched.updatedAt).toBeUndefined()
  })

  it("still records truthful provenance for a document edited during publishing, leaving it dirty", async () => {
    const patch = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce({ _id: "doc_1", projectId: "project_1", updatedAt: 9 })
      .mockResolvedValueOnce(project)

    const result = await (markPublishedSnapshot as any).handler(createCtx({ get, patch }), {
      ...snapshotArgs({ expectedUpdatedAt: 5 }), // a save landed mid-publish
      projectAccessToken: await patToken(),
    })

    expect(result).toEqual({ synchronized: false })
    const [, patched] = patch.mock.calls[0]
    // What landed on the lane is recorded (publishedUpdatedAt: 5), but the
    // document's own updatedAt (9) is untouched - 5 !== 9 keeps it dirty.
    expect(patched.publishedProvenance).toEqual(
      expect.objectContaining({ publishBranchId: "lane_1", commitSha: "commit-1", publishedUpdatedAt: 5 }),
    )
    expect(patched.updatedAt).toBeUndefined()
  })

  it("replaying after a post-sync edit cannot flip the newer draft clean", async () => {
    const patch = vi.fn()
    // First pass synchronized at updatedAt 5; the user then saved (9). A
    // reconciliation retry replays the ORIGINAL association.
    const editedAfterSync = {
      _id: "doc_1",
      projectId: "project_1",
      updatedAt: 9,
      publishedProvenance: {
        publishBranchId: "lane_1",
        commitSha: "commit-1",
        contentRevision: CONTENT_REVISION,
        publishedUpdatedAt: 5,
      },
    }
    const get = vi.fn().mockResolvedValueOnce(editedAfterSync).mockResolvedValueOnce(project)

    const result = await (markPublishedSnapshot as any).handler(createCtx({ get, patch }), {
      ...snapshotArgs({ expectedUpdatedAt: 5 }),
      projectAccessToken: await patToken(),
    })

    expect(result).toEqual({ synchronized: false })
    const [, patched] = patch.mock.calls[0]
    expect(patched.publishedProvenance.publishedUpdatedAt).toBe(5)
    expect(patched.updatedAt).toBeUndefined()
  })

  it("accepts legacy replays without a contentRevision", async () => {
    const patch = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce({ _id: "doc_1", projectId: "project_1", updatedAt: 5 })
      .mockResolvedValueOnce(project)

    const result = await (markPublishedSnapshot as any).handler(createCtx({ get, patch }), {
      ...snapshotArgs({ contentRevision: undefined }),
      projectAccessToken: await patToken(),
    })

    expect(result).toEqual({ synchronized: true })
    const [, patched] = patch.mock.calls[0]
    expect("contentRevision" in patched.publishedProvenance).toBe(false)
  })

  it("excludes lane-synchronized documents from the dirty list until they are edited again", async () => {
    const get = vi.fn().mockResolvedValue(project)
    const ctx = createCtx({
      get,
      draftDocs: [
        // Clean: published snapshot still current.
        {
          _id: "doc_clean",
          body: "# A",
          frontmatter: null,
          updatedAt: 10,
          publishedProvenance: { publishBranchId: "lane_1", commitSha: "commit-1", publishedUpdatedAt: 10 },
        },
        // Dirty: edited after the publish.
        {
          _id: "doc_edited",
          body: "# B",
          frontmatter: null,
          updatedAt: 12,
          publishedProvenance: { publishBranchId: "lane_1", commitSha: "commit-1", publishedUpdatedAt: 10 },
        },
        // Dirty: never published.
        { _id: "doc_new", body: "# C", frontmatter: null, updatedAt: 3 },
        // Dirty again: provenance cleared when its lane closed unmerged.
        { _id: "doc_invalidated", body: "# D", frontmatter: null, updatedAt: 7 },
      ],
    })

    const result = await (listDirtyForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(result.map((d: { _id: string }) => d._id)).toEqual(["doc_edited", "doc_new", "doc_invalidated"])
  })
})
