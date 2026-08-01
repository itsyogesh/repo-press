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

import { listDirtyForProject, markPublishedSnapshot, saveDraft } from "@/convex/documents"
import { isDocumentContentClean } from "@/convex/lib/documentCleanliness"
import { mintProjectAccessToken, mintServerQueryToken } from "@/lib/project-access-token"

async function patToken() {
  return mintProjectAccessToken({
    projectId: "project_1",
    userId: "user_owner",
    repoOwner: "acme",
    repoName: "docs-site",
    branch: "main",
  })
}

const project = { _id: "project_1", userId: "user_owner", contentRoot: "content", branch: "main" }
const CONTENT_REVISION = "c".repeat(64)
const COMMIT_SHA = "a".repeat(40)
const BLOB_SHA = "b".repeat(40)
const defaultLane = {
  _id: "lane_1",
  projectId: "project_1",
  branchName: "repopress/main/1234",
  status: "active",
}
let serverQueryToken: string

function snapshotArgs(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc_1",
    githubSha: BLOB_SHA,
    publishBranchId: "lane_1",
    authorityKind: "lane",
    authorityBranch: "repopress/main/1234",
    commitSha: COMMIT_SHA,
    contentRevision: CONTENT_REVISION,
    expectedUpdatedAt: 5,
    serverQueryToken,
    userId: "user_owner",
    ...overrides,
  }
}

function createAuthorityCtx(rows: Array<Record<string, unknown>>) {
  const byId = new Map(rows.map((row) => [String(row._id), row]))
  return {
    db: {
      get: vi.fn(async (id: string) => byId.get(String(id)) ?? null),
      patch: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      query: vi.fn(),
    },
    scheduler: { runAfter: vi.fn() },
  } as any
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
      get: vi.fn(async (id: string) => (id === "lane_1" ? defaultLane : (get as any)(id))),
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
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.BETTER_AUTH_SECRET = "test-secret"
    serverQueryToken = await mintServerQueryToken()
    safeGetAuthUserMock.mockResolvedValue(null)
  })

  describe("authority integrity", () => {
    const document = {
      _id: "doc_1",
      projectId: "project_1",
      updatedAt: 5,
      contentVersion: 2,
    }
    const lane = defaultLane

    async function validServerArgs(overrides: Record<string, unknown> = {}) {
      return {
        ...snapshotArgs({ publishedContentVersion: 2 }),
        serverQueryToken: await mintServerQueryToken(),
        projectAccessToken: await patToken(),
        ...overrides,
      }
    }

    it("rejects an editor forging a no-attempt provenance stamp without server proof", async () => {
      const ctx = createAuthorityCtx([document, project, lane])

      await expect(
        (markPublishedSnapshot as any).handler(ctx, {
          ...snapshotArgs({ publishedContentVersion: 2 }),
          serverQueryToken: undefined,
          projectAccessToken: await patToken(),
        }),
      ).rejects.toThrow(/server/i)
      expect(ctx.db.patch).not.toHaveBeenCalled()
    })

    it("accepts server-proven base authority only for the project's configured branch", async () => {
      const ctx = createAuthorityCtx([document, project])

      const result = await (markPublishedSnapshot as any).handler(
        ctx,
        await validServerArgs({
          authorityKind: "base",
          authorityBranch: "main",
          publishBranchId: undefined,
        }),
      )

      expect(result).toEqual({ synchronized: true })
      expect(ctx.db.patch).toHaveBeenCalledWith(
        "doc_1",
        expect.objectContaining({
          publishedProvenance: expect.objectContaining({ authorityKind: "base", authorityBranch: "main" }),
        }),
      )
    })

    it("rejects a base authority branch that differs from the project", async () => {
      const ctx = createAuthorityCtx([document, project])

      await expect(
        (markPublishedSnapshot as any).handler(
          ctx,
          await validServerArgs({
            authorityKind: "base",
            authorityBranch: "develop",
            publishBranchId: undefined,
          }),
        ),
      ).rejects.toThrow(/base.*branch|authority/i)
      expect(ctx.db.patch).not.toHaveBeenCalled()
    })

    it.each([
      ["nonexistent", [], "lane_1"],
      ["cross-project", [{ ...lane, projectId: "project_other" }], "lane_1"],
      ["branch mismatch", [{ ...lane, branchName: "repopress/other" }], "lane_1"],
      ["finished lane", [{ ...lane, status: "closed" }], "lane_1"],
    ])("rejects %s lane authority", async (_label, lanes, publishBranchId) => {
      const ctx = createAuthorityCtx([document, project, ...lanes])

      await expect(
        (markPublishedSnapshot as any).handler(ctx, await validServerArgs({ publishBranchId })),
      ).rejects.toThrow(/lane|authority|branch/i)
      expect(ctx.db.patch).not.toHaveBeenCalled()
    })

    it("accepts a server-proven active lane belonging to the document project", async () => {
      const ctx = createAuthorityCtx([document, project, lane])

      const result = await (markPublishedSnapshot as any).handler(ctx, await validServerArgs())

      expect(result).toEqual({ synchronized: true })
      expect(ctx.db.patch).toHaveBeenCalledTimes(1)
    })

    it.each([
      ["blob SHA", { githubSha: "not-a-sha" }],
      ["commit SHA", { commitSha: "not-a-sha" }],
      ["content revision", { contentRevision: "not-a-revision" }],
      ["negative content version", { publishedContentVersion: -1 }],
      ["fractional content version", { publishedContentVersion: 1.5 }],
    ])("rejects malformed %s", async (_label, override) => {
      const ctx = createAuthorityCtx([document, project, lane])

      await expect((markPublishedSnapshot as any).handler(ctx, await validServerArgs(override))).rejects.toThrow(
        /invalid|sha|revision|version/i,
      )
      expect(ctx.db.patch).not.toHaveBeenCalled()
    })
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
      githubSha: BLOB_SHA,
      lastPublishedUpdatedAt: undefined,
      publishedProvenance: {
        authorityKind: "lane",
        authorityBranch: "repopress/main/1234",
        publishBranchId: "lane_1",
        commitSha: COMMIT_SHA,
        contentRevision: CONTENT_REVISION,
        publishedUpdatedAt: 5,
      },
    })
    // The whole idempotency design: recording provenance never bumps
    // updatedAt, so cleanliness (publishedUpdatedAt === updatedAt) is
    // stable across replays.
    expect(patched.updatedAt).toBeUndefined()
  })

  it("records exact publish-attempt ownership in document provenance", async () => {
    const patch = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce({ _id: "doc_1", projectId: "project_1", updatedAt: 5, contentVersion: 3 })
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({
        _id: "attempt_1",
        projectId: "project_1",
        publishBranchId: "lane_1",
        branchName: "repopress/main/1234",
        commitSha: COMMIT_SHA,
        status: "committed",
        documentAssociations: [
          {
            documentId: "doc_1",
            repoPath: "content/a.mdx",
            expectedUpdatedAt: 5,
            contentRevision: CONTENT_REVISION,
            contentVersion: 3,
          },
        ],
      })

    await (markPublishedSnapshot as any).handler(createCtx({ get, patch }), {
      ...snapshotArgs({ publishAttemptId: "attempt_1", publishedContentVersion: 3, repoPath: "content/a.mdx" }),
      projectAccessToken: await patToken(),
    })

    expect(patch).toHaveBeenCalledWith(
      "doc_1",
      expect.objectContaining({
        publishedProvenance: expect.objectContaining({
          publishBranchId: "lane_1",
          publishAttemptId: "attempt_1",
          publishedContentVersion: 3,
        }),
      }),
    )
  })

  it("replays the same lane/commit/revision association as a no-op", async () => {
    const patch = vi.fn()
    const alreadyStamped = {
      _id: "doc_1",
      projectId: "project_1",
      updatedAt: 5,
      publishedProvenance: {
        authorityKind: "lane",
        authorityBranch: "repopress/main/1234",
        publishBranchId: "lane_1",
        commitSha: COMMIT_SHA,
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
      expect.objectContaining({ publishBranchId: "lane_1", commitSha: COMMIT_SHA, publishedUpdatedAt: 5 }),
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

  it("excludes lane-synchronized documents from the dirty list until their CONTENT changes", async () => {
    const get = vi.fn().mockResolvedValue(project)
    const ctx = createCtx({
      get,
      draftDocs: [
        // Clean: content version unchanged since the publish, even though a
        // workflow transition bumped updatedAt afterwards. This is the
        // dead-end the content-specific version exists to prevent.
        {
          _id: "doc_workflow_transitioned",
          body: "# A",
          frontmatter: null,
          updatedAt: 30,
          contentVersion: 4,
          publishedProvenance: {
            publishBranchId: "lane_1",
            commitSha: "commit-1",
            publishedContentVersion: 4,
            publishedUpdatedAt: 10,
          },
        },
        // Dirty: content edited after the publish (version advanced).
        {
          _id: "doc_edited",
          body: "# B",
          frontmatter: null,
          updatedAt: 12,
          contentVersion: 5,
          publishedProvenance: {
            publishBranchId: "lane_1",
            commitSha: "commit-1",
            publishedContentVersion: 4,
            publishedUpdatedAt: 10,
          },
        },
        // Dirty: never published.
        { _id: "doc_new", body: "# C", frontmatter: null, updatedAt: 3 },
        // Dirty again: provenance cleared when its lane closed unmerged.
        { _id: "doc_invalidated", body: "# D", frontmatter: null, updatedAt: 7, contentVersion: 2 },
        // Dirty migration candidate: provenance recorded before
        // contentVersion cannot prove byte identity.
        {
          _id: "doc_versionless_provenance",
          body: "# E",
          frontmatter: null,
          updatedAt: 10,
          publishedProvenance: { publishBranchId: "lane_1", commitSha: "commit-1", publishedUpdatedAt: 10 },
        },
        // Dirty migration candidate: timestamps are not Git evidence.
        { _id: "doc_legacy_clean", body: "# F", frontmatter: null, updatedAt: 10, lastPublishedUpdatedAt: 10 },
        // Dirty: legacy row edited after its legacy marker.
        { _id: "doc_legacy_edited", body: "# G", frontmatter: null, updatedAt: 12, lastPublishedUpdatedAt: 10 },
      ],
    })

    const result = await (listDirtyForProject as any).handler(ctx, {
      projectId: "project_1",
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(result.map((d: { _id: string }) => d._id)).toEqual([
      "doc_edited",
      "doc_new",
      "doc_invalidated",
      "doc_versionless_provenance",
      "doc_legacy_clean",
      "doc_legacy_edited",
    ])
  })

  it("uses one content-specific cleanliness predicate and never trusts legacy timestamps", () => {
    expect(
      isDocumentContentClean({
        updatedAt: 99,
        contentVersion: 3,
        publishedProvenance: {
          authorityKind: "base",
          authorityBranch: "main",
          commitSha: "a".repeat(40),
          publishedUpdatedAt: 5,
          publishedContentVersion: 3,
        },
      }),
    ).toBe(true)
    expect(
      isDocumentContentClean({
        updatedAt: 5,
        contentVersion: 3,
        publishedProvenance: {
          publishBranchId: "lane_1",
          commitSha: "a".repeat(40),
          publishedUpdatedAt: 5,
        },
      }),
    ).toBe(false)
    expect(isDocumentContentClean({ updatedAt: 5, contentVersion: 0, lastPublishedUpdatedAt: 5 })).toBe(false)
  })

  it("records base authority without inventing a publish lane", async () => {
    const patch = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce({ _id: "doc_1", projectId: "project_1", updatedAt: 5, contentVersion: 2 })
      .mockResolvedValueOnce(project)

    const result = await (markPublishedSnapshot as any).handler(createCtx({ get, patch }), {
      ...snapshotArgs({
        publishBranchId: undefined,
        authorityKind: "base",
        authorityBranch: "main",
        publishedContentVersion: 2,
      }),
      projectAccessToken: await patToken(),
    })

    expect(result).toEqual({ synchronized: true })
    expect(patch).toHaveBeenCalledWith(
      "doc_1",
      expect.objectContaining({
        publishedProvenance: expect.objectContaining({
          authorityKind: "base",
          authorityBranch: "main",
          commitSha: COMMIT_SHA,
        }),
      }),
    )
    expect(patch.mock.calls[0][1].publishedProvenance.publishBranchId).toBeUndefined()
  })

  it("rejects inconsistent lane and attempt provenance authority", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ _id: "doc_1", projectId: "project_1", updatedAt: 5, contentVersion: 2 })
      .mockResolvedValueOnce(project)

    await expect(
      (markPublishedSnapshot as any).handler(createCtx({ get }), {
        ...snapshotArgs({
          authorityKind: "base",
          authorityBranch: "main",
          publishAttemptId: "attempt_1",
          publishedContentVersion: 2,
        }),
        projectAccessToken: await patToken(),
      }),
    ).rejects.toThrow(/base provenance cannot reference a publish lane or attempt/i)
  })

  it("judges synchronization by content version and migrates the legacy marker", async () => {
    const patch = vi.fn()
    // A workflow transition bumped updatedAt after planning, but the
    // content itself is untouched - the stamp still synchronizes.
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "doc_1",
        projectId: "project_1",
        updatedAt: 30,
        contentVersion: 4,
        lastPublishedUpdatedAt: 9,
      })
      .mockResolvedValueOnce(project)

    const result = await (markPublishedSnapshot as any).handler(createCtx({ get, patch }), {
      ...snapshotArgs({ expectedUpdatedAt: 10, publishedContentVersion: 4 }),
      projectAccessToken: await patToken(),
    })

    expect(result).toEqual({ synchronized: true })
    const [, patched] = patch.mock.calls[0]
    expect(patched.publishedProvenance.publishedContentVersion).toBe(4)
    // Lazy migration: recording real provenance clears the legacy marker.
    expect("lastPublishedUpdatedAt" in patched).toBe(true)
    expect(patched.lastPublishedUpdatedAt).toBeUndefined()
  })

  it("saveDraft advances the content version so real edits dirty the document", async () => {
    const patch = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValueOnce({ _id: "doc_1", projectId: "project_1", status: "draft", updatedAt: 5, contentVersion: 4 })
      .mockResolvedValueOnce(project)

    await (saveDraft as any).handler(createCtx({ get, patch }), {
      id: "doc_1",
      body: "# Edited",
      frontmatter: { title: "Edited" },
      userId: "user_owner",
      projectAccessToken: await patToken(),
    })

    expect(patch).toHaveBeenCalledWith("doc_1", expect.objectContaining({ body: "# Edited", contentVersion: 5 }))
  })
})
