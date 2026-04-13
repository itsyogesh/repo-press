import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Hoisted mocks ────────────────────────────────────────────────────────────

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

const { verifyServerQueryTokenMock } = vi.hoisted(() => ({
  verifyServerQueryTokenMock: vi.fn(),
}))

vi.mock("@/lib/project-access-token", () => ({
  verifyServerQueryToken: verifyServerQueryTokenMock,
  verifyProjectAccessToken: vi.fn(),
  mintServerQueryToken: vi.fn(),
  mintProjectAccessToken: vi.fn(),
}))

// ── Import after mocks ───────────────────────────────────────────────────────

import { getOrCreate, removeAllOrphans, syncProjectsFromConfig } from "@/convex/projects"

// ── Shared helpers ───────────────────────────────────────────────────────────

type ProjectRow = {
  _id: string
  userId: string
  repoOwner: string
  repoName: string
  branch: string
  contentRoot: string
  name: string
  detectedFramework: string
  contentType: string
  configProjectId?: string
  configVersion?: number
  configPath?: string
  frameworkSource?: string
  configRemoved?: boolean
  configRemovedAt?: number
  previewEntry?: string
  enabledPlugins?: string[]
  pluginRegistry?: unknown
  components?: unknown
}

function makeProject(overrides: Partial<ProjectRow> & { _id: string }): ProjectRow {
  return {
    userId: "user_owner",
    repoOwner: "acme",
    repoName: "docs",
    branch: "main",
    contentRoot: "content/docs",
    name: "Docs",
    detectedFramework: "fumadocs",
    contentType: "docs",
    frameworkSource: "config",
    ...overrides,
  }
}

/** Creates a minimal Convex ctx mock with controllable DB behavior. */
function createCtx({
  repoProjects = [] as ProjectRow[],
  tombstone = null as Partial<ProjectRow> | null,
  patch = vi.fn(),
  insert = vi.fn().mockResolvedValue("new_project_id"),
} = {}) {
  return {
    db: {
      get: vi.fn(),
      patch,
      insert,
      delete: vi.fn(),
      query: vi.fn((table: string) => ({
        withIndex: (_index: string, _fn: unknown) => {
          if (table === "projects") {
            return {
              collect: vi.fn().mockResolvedValue(repoProjects),
            }
          }
          if (table === "deletedConfigProjects") {
            return {
              first: vi.fn().mockResolvedValue(tombstone),
            }
          }
          return {
            collect: vi.fn().mockResolvedValue([]),
            first: vi.fn().mockResolvedValue(null),
          }
        },
      })),
    },
    scheduler: { runAfter: vi.fn() },
  } as any
}

const BASE_ARGS = {
  serverQueryToken: "valid_server_token",
  actingUserId: "user_owner",
  repoOwner: "acme",
  repoName: "docs",
  branch: "main",
  configVersion: 1,
  configPath: "repopress.config.json",
  projects: [
    {
      configProjectId: "docs",
      name: "Documentation",
      contentRoot: "content/docs",
      framework: "fumadocs",
      contentType: "docs" as const,
    },
  ],
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("syncProjectsFromConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue(null)
    verifyServerQueryTokenMock.mockResolvedValue(true)
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  describe("authentication", () => {
    it("accepts a valid serverQueryToken + actingUserId (server-side path)", async () => {
      const ctx = createCtx()

      const result = await (syncProjectsFromConfig as any).handler(ctx, BASE_ARGS)

      expect(result).toMatchObject({ created: ["new_project_id"], synced: [], unchanged: [], orphaned: [] })
    })

    it("rejects when no auth method succeeds", async () => {
      safeGetAuthUserMock.mockResolvedValue(null)
      verifyServerQueryTokenMock.mockResolvedValue(false)
      const ctx = createCtx()

      await expect(
        (syncProjectsFromConfig as any).handler(ctx, {
          ...BASE_ARGS,
          serverQueryToken: undefined,
          actingUserId: undefined,
        }),
      ).rejects.toThrow("Unauthorized: no valid authentication")
    })

    it("accepts OAuth session user - ignores actingUserId", async () => {
      safeGetAuthUserMock.mockResolvedValue({ _id: "oauth_user" })
      const ctx = createCtx()

      const result = await (syncProjectsFromConfig as any).handler(ctx, {
        ...BASE_ARGS,
        serverQueryToken: undefined,
        actingUserId: undefined,
      })

      expect(result.created).toHaveLength(1)
    })

    it("rejects when OAuth session userId mismatches supplied userId", async () => {
      safeGetAuthUserMock.mockResolvedValue({ _id: "user_A" })
      const ctx = createCtx()

      await expect(
        (syncProjectsFromConfig as any).handler(ctx, {
          ...BASE_ARGS,
          serverQueryToken: undefined,
          userId: "user_B", // deliberate mismatch
        }),
      ).rejects.toThrow("Unauthorized: caller identity does not match userId")
    })
  })

  // ── Idempotency / update ─────────────────────────────────────────────────

  describe("idempotency", () => {
    it("patches an existing project when name changes (needs update)", async () => {
      const existing = makeProject({ _id: "proj_1", configProjectId: "docs", name: "Old Name" })
      const patch = vi.fn()
      const ctx = createCtx({ repoProjects: [existing], patch })

      const result = await (syncProjectsFromConfig as any).handler(ctx, {
        ...BASE_ARGS,
        projects: [{ ...BASE_ARGS.projects[0], name: "New Name" }],
      })

      expect(patch).toHaveBeenCalledWith("proj_1", expect.objectContaining({ name: "New Name" }))
      expect(result.synced).toContain("proj_1")
      expect(result.unchanged).toHaveLength(0)
    })

    it("skips patch when nothing changed (unchanged path)", async () => {
      const existing = makeProject({
        _id: "proj_1",
        configProjectId: "docs",
        name: "Documentation",
        contentRoot: "content/docs",
        branch: "main",
        detectedFramework: "fumadocs",
        contentType: "docs",
        configVersion: 1,
        configPath: "repopress.config.json",
        frameworkSource: "config",
      })
      const patch = vi.fn()
      const ctx = createCtx({ repoProjects: [existing], patch })

      const result = await (syncProjectsFromConfig as any).handler(ctx, BASE_ARGS)

      expect(patch).not.toHaveBeenCalled()
      expect(result.unchanged).toContain("proj_1")
    })

    it("creates a new project when none matches configProjectId", async () => {
      const insert = vi.fn().mockResolvedValue("brand_new_proj")
      const ctx = createCtx({ repoProjects: [], insert })

      const result = await (syncProjectsFromConfig as any).handler(ctx, BASE_ARGS)

      expect(insert).toHaveBeenCalledWith(
        "projects",
        expect.objectContaining({
          configProjectId: "docs",
          contentRoot: "content/docs",
          frameworkSource: "config",
        }),
      )
      expect(result.created).toContain("brand_new_proj")
    })

    it("migrates a legacy project (no configProjectId) matched by contentRoot+branch", async () => {
      // Pre-config-era project: no configProjectId stored
      const legacy = makeProject({
        _id: "legacy_proj",
        configProjectId: undefined,
        branch: "main",
        contentRoot: "content/docs",
        name: "Old Docs",
      })
      const patch = vi.fn()
      const ctx = createCtx({ repoProjects: [legacy], patch })

      const result = await (syncProjectsFromConfig as any).handler(ctx, BASE_ARGS)

      // Should patch (assign configProjectId + update name) rather than create duplicate
      expect(patch).toHaveBeenCalledWith("legacy_proj", expect.objectContaining({ configProjectId: "docs" }))
      expect(result.synced).toContain("legacy_proj")
      expect(result.created).toHaveLength(0)
    })
  })

  // ── Tombstone / deletion ─────────────────────────────────────────────────

  describe("tombstone (deletedConfigProjects)", () => {
    it("skips tombstoned projects by default during sync", async () => {
      const tombstone = { _id: "tomb_1", repoOwner: "acme", repoName: "docs", configProjectId: "docs" }
      const insert = vi.fn()
      const ctx = createCtx({ repoProjects: [], tombstone, insert })

      const result = await (syncProjectsFromConfig as any).handler(ctx, BASE_ARGS)

      expect(ctx.db.delete).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
      expect(result.created).toHaveLength(0)
    })

    it("clears tombstone only when the project ID is explicitly restored", async () => {
      const tombstone = { _id: "tomb_1", repoOwner: "acme", repoName: "docs", configProjectId: "docs" }
      const insert = vi.fn().mockResolvedValue("recreated_proj_id")
      const ctx = createCtx({ repoProjects: [], tombstone, insert })

      const result = await (syncProjectsFromConfig as any).handler(ctx, {
        ...BASE_ARGS,
        restoredConfigProjectIds: ["docs"],
      })

      expect(ctx.db.delete).toHaveBeenCalledWith("tomb_1")
      expect(insert).toHaveBeenCalledWith("projects", expect.objectContaining({ configProjectId: "docs" }))
      expect(result.created).toContain("recreated_proj_id")
    })

    it("does not clear a tombstone when a different project was restored", async () => {
      const tombstone = { _id: "tomb_1", repoOwner: "acme", repoName: "docs", configProjectId: "docs" }
      const insert = vi.fn()
      const ctx = createCtx({ repoProjects: [], tombstone, insert })

      await (syncProjectsFromConfig as any).handler(ctx, {
        ...BASE_ARGS,
        restoredConfigProjectIds: ["blog"],
      })

      expect(ctx.db.delete).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })

    it("does NOT clear tombstone for Studio auto-syncs even if the project ID is restored", async () => {
      const tombstone = { _id: "tomb_1", repoOwner: "acme", repoName: "docs", configProjectId: "docs" }
      const insert = vi.fn()
      const ctx = createCtx({ repoProjects: [], tombstone, insert })

      await (syncProjectsFromConfig as any).handler(ctx, {
        ...BASE_ARGS,
        runOrphanDetection: false,
        restoredConfigProjectIds: ["docs"],
      })

      expect(ctx.db.delete).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })
  })

  // ── Orphan detection ─────────────────────────────────────────────────────

  describe("orphan detection", () => {
    it("flags a config-driven project as configRemoved when it disappears from config", async () => {
      // An existing config-driven project NOT in the new config snapshot
      const orphan = makeProject({
        _id: "proj_orphan",
        configProjectId: "old-blog",
        frameworkSource: "config",
        configRemoved: false,
      })
      const patch = vi.fn()
      const ctx = createCtx({ repoProjects: [orphan], patch })

      const configWithoutOldBlog = {
        ...BASE_ARGS,
        projects: [
          {
            configProjectId: "docs",
            name: "Docs",
            contentRoot: "content/docs",
            framework: "fumadocs",
            contentType: "docs",
          },
        ],
      }

      // Sync with a config that does NOT include "old-blog"
      const result = await (syncProjectsFromConfig as any).handler(ctx, configWithoutOldBlog)

      // Orphan should be patched with configRemoved: true
      expect(patch).toHaveBeenCalledWith("proj_orphan", expect.objectContaining({ configRemoved: true }))
      // Return value must include the orphaned project ID
      expect(result.orphaned).toContain("proj_orphan")
    })

    it("clears configRemoved when a project is re-added to config", async () => {
      const returning = makeProject({
        _id: "proj_returning",
        configProjectId: "docs",
        frameworkSource: "config",
        configRemoved: true,
        configRemovedAt: 1000000,
        // All fields match so needsUpdate triggers only for configRemoved clearing
        name: "Documentation",
        contentRoot: "content/docs",
        branch: "main",
        detectedFramework: "fumadocs",
        contentType: "docs",
        configVersion: 1,
        configPath: "repopress.config.json",
      })
      const patch = vi.fn()
      const ctx = createCtx({ repoProjects: [returning], patch })

      const result = await (syncProjectsFromConfig as any).handler(ctx, BASE_ARGS)

      // Should clear configRemoved + configRemovedAt via needsUpdate path
      const patchCall = patch.mock.calls.find((call) => call[0] === "proj_returning")
      expect(patchCall).toBeDefined()
      expect(patchCall![1]).toMatchObject({ configRemoved: undefined, configRemovedAt: undefined })
      // Re-added orphan must land in synced[], not unchanged[]
      expect(result.synced).toContain("proj_returning")
      expect(result.unchanged).not.toContain("proj_returning")
    })

    it("does NOT flag manual (non-config) projects as orphans", async () => {
      const manualProject = makeProject({
        _id: "manual_proj",
        configProjectId: "manual-docs",
        frameworkSource: "manual", // NOT "config"
      })
      const patch = vi.fn()
      const ctx = createCtx({ repoProjects: [manualProject], patch })

      // Sync with a config that doesn't include "manual-docs"
      await (syncProjectsFromConfig as any).handler(ctx, {
        ...BASE_ARGS,
        projects: [],
      })

      // patch must not be called for orphan marking
      const orphanPatch = patch.mock.calls.find((call) => call[0] === "manual_proj" && call[1]?.configRemoved === true)
      expect(orphanPatch).toBeUndefined()
    })

    it("does NOT flag a project with name starting with [DELETING] as orphan", async () => {
      const deleting = makeProject({
        _id: "proj_deleting",
        configProjectId: "blog",
        frameworkSource: "config",
        name: "[DELETING] Blog",
      })
      const patch = vi.fn()
      const ctx = createCtx({ repoProjects: [deleting], patch })

      await (syncProjectsFromConfig as any).handler(ctx, {
        ...BASE_ARGS,
        projects: [],
      })

      const orphanPatch = patch.mock.calls.find(
        (call) => call[0] === "proj_deleting" && call[1]?.configRemoved === true,
      )
      expect(orphanPatch).toBeUndefined()
    })

    it("DOES flag config-managed projects with a branch override as orphans when absent from config", async () => {
      // Before the fix, a project with branch: "release" was silently skipped
      // by an incorrect `project.branch !== args.branch` guard, so it was never
      // orphaned even when removed from the config. This test verifies the fix.
      const otherBranchProject = makeProject({
        _id: "proj_release_docs",
        branch: "release",
        configProjectId: "release-docs",
        frameworkSource: "config",
      })
      const patch = vi.fn()
      const ctx = createCtx({ repoProjects: [otherBranchProject], patch })

      // Sync from main - config does NOT contain "release-docs"
      const result = await (syncProjectsFromConfig as any).handler(ctx, BASE_ARGS)

      // "release-docs" is no longer in the config, so it must be orphaned
      // regardless of its content branch.
      const orphanPatch = patch.mock.calls.find(
        (call) => call[0] === "proj_release_docs" && call[1]?.configRemoved === true,
      )
      expect(orphanPatch).toBeDefined()
      expect(result.orphaned).toContain("proj_release_docs")
    })

    it("does NOT orphan when runOrphanDetection is false (Studio sync safety)", async () => {
      // Studio-triggered syncs pass runOrphanDetection: false to avoid falsely
      // orphaning projects absent from a non-canonical branch's config.
      const configManagedProject = makeProject({
        _id: "proj_main_docs",
        branch: "main",
        configProjectId: "main-docs",
        frameworkSource: "config",
      })
      const patch = vi.fn()
      const ctx = createCtx({ repoProjects: [configManagedProject], patch })

      // Config is empty + runOrphanDetection: false - simulates Studio sync on feature branch
      const result = await (syncProjectsFromConfig as any).handler(ctx, {
        ...BASE_ARGS,
        projects: [],
        runOrphanDetection: false,
      })

      // No orphan patches should fire
      const orphanPatch = patch.mock.calls.find(
        (call) => call[0] === "proj_main_docs" && call[1]?.configRemoved === true,
      )
      expect(orphanPatch).toBeUndefined()
      expect(result.orphaned).toHaveLength(0)
    })
  })

  // ── Multi-project ────────────────────────────────────────────────────────

  describe("multiple projects", () => {
    it("returns correct counts when syncing a mix of new, updated, and unchanged", async () => {
      const unchanged = makeProject({
        _id: "proj_unch",
        configProjectId: "docs",
        name: "Documentation",
        contentRoot: "content/docs",
        branch: "main",
        detectedFramework: "fumadocs",
        contentType: "docs",
        configVersion: 1,
        configPath: "repopress.config.json",
        frameworkSource: "config",
      })
      const outdated = makeProject({
        _id: "proj_out",
        configProjectId: "blog",
        name: "Old Blog",
        contentRoot: "content/blog",
        branch: "main",
        detectedFramework: "custom",
        contentType: "blog",
        frameworkSource: "config",
        configVersion: 0, // triggers needsUpdate
        configPath: "repopress.config.json",
      })
      const patch = vi.fn()
      const insert = vi.fn().mockResolvedValue("new_id")
      const ctx = createCtx({ repoProjects: [unchanged, outdated], patch, insert })

      const result = await (syncProjectsFromConfig as any).handler(ctx, {
        ...BASE_ARGS,
        projects: [
          {
            configProjectId: "docs",
            name: "Documentation",
            contentRoot: "content/docs",
            framework: "fumadocs",
            contentType: "docs",
          },
          {
            configProjectId: "blog",
            name: "Blog",
            contentRoot: "content/blog",
            framework: "custom",
            contentType: "blog",
          },
          {
            configProjectId: "new-section",
            name: "New",
            contentRoot: "content/new",
            framework: "custom",
            contentType: "custom",
          },
        ],
      })

      expect(result.unchanged).toContain("proj_unch")
      expect(result.synced).toContain("proj_out")
      expect(result.created).toContain("new_id")
    })
  })
})

// ── getOrCreate tests ─────────────────────────────────────────────────────────

describe("getOrCreate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue({ _id: "user_owner" })
  })

  function createGetOrCreateCtx({
    matchingProjects = [] as ProjectRow[],
    patch = vi.fn(),
    insert = vi.fn().mockResolvedValue("new_project_id"),
  } = {}) {
    return {
      db: {
        get: vi.fn(),
        patch,
        insert,
        delete: vi.fn(),
        query: vi.fn((_table: string) => ({
          withIndex: (_index: string, _fn: unknown) => ({
            filter: (_filterFn: unknown) => ({
              collect: vi.fn().mockResolvedValue(matchingProjects),
            }),
          }),
        })),
      },
      scheduler: { runAfter: vi.fn() },
    } as any
  }

  const GET_OR_CREATE_ARGS = {
    userId: "user_owner",
    repoOwner: "acme",
    repoName: "docs",
    branch: "main",
    contentRoot: "content/docs",
    name: "Docs",
    contentType: "docs" as const,
  }

  it("does NOT clear configRemoved flag (orphan cleanup is explicit)", async () => {
    const orphanedProject = makeProject({
      _id: "proj_orphan",
      configRemoved: true,
      configRemovedAt: 1000000,
    })
    const patch = vi.fn()
    const ctx = createGetOrCreateCtx({ matchingProjects: [orphanedProject], patch })

    const result = await (getOrCreate as any).handler(ctx, GET_OR_CREATE_ARGS)

    expect(result).toBe("proj_orphan")
    // Should NOT patch to clear configRemoved - orphan cleanup is explicit
    expect(patch).not.toHaveBeenCalled()
  })

  it("creates a new project when existing project is [DELETING]", async () => {
    const deletingProject = makeProject({
      _id: "proj_deleting",
      name: "[DELETING] Old Blog",
    })
    const patch = vi.fn()
    const insert = vi.fn().mockResolvedValue("new_proj_id")
    const ctx = createGetOrCreateCtx({ matchingProjects: [deletingProject], patch, insert })

    const result = await (getOrCreate as any).handler(ctx, GET_OR_CREATE_ARGS)

    expect(result).toBe("new_proj_id")
    // Should NOT patch the deleting project
    expect(patch).not.toHaveBeenCalled()
    // Should insert a fresh project
    expect(insert).toHaveBeenCalledWith(
      "projects",
      expect.objectContaining({
        repoOwner: GET_OR_CREATE_ARGS.repoOwner,
        repoName: GET_OR_CREATE_ARGS.repoName,
      }),
    )
  })

  it("returns the recreated project when a deleting row still exists", async () => {
    const deletingProject = makeProject({
      _id: "proj_deleting",
      name: "[DELETING] Old Blog",
    })
    const recreatedProject = makeProject({
      _id: "proj_recreated",
      name: "Docs",
    })
    const patch = vi.fn()
    const insert = vi.fn()
    const ctx = createGetOrCreateCtx({
      matchingProjects: [deletingProject, recreatedProject],
      patch,
      insert,
    })

    const result = await (getOrCreate as any).handler(ctx, GET_OR_CREATE_ARGS)

    expect(result).toBe("proj_recreated")
    expect(insert).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
  })

  it("does NOT clear configRemoved when project is not orphaned", async () => {
    const normalProject = makeProject({
      _id: "proj_normal",
      configRemoved: undefined,
    })
    const patch = vi.fn()
    const ctx = createGetOrCreateCtx({ matchingProjects: [normalProject], patch })

    const result = await (getOrCreate as any).handler(ctx, GET_OR_CREATE_ARGS)

    expect(result).toBe("proj_normal")
    // No patch should be called since nothing changed
    expect(patch).not.toHaveBeenCalled()
  })
})

// ── removeAllOrphans tests ────────────────────────────────────────────────────

describe("removeAllOrphans", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeGetAuthUserMock.mockResolvedValue(null)
    verifyServerQueryTokenMock.mockResolvedValue(true)
  })

  function createRemoveCtx({
    repoProjects = [] as ProjectRow[],
    patch = vi.fn(),
    insert = vi.fn().mockResolvedValue("tombstone_id"),
    existingTombstone = null as any,
  } = {}) {
    return {
      db: {
        get: vi.fn(),
        patch,
        insert,
        delete: vi.fn(),
        query: vi.fn((table: string) => ({
          withIndex: (_index: string, _fn: unknown) => ({
            collect: vi.fn().mockResolvedValue(table === "projects" ? repoProjects : []),
            first: vi.fn().mockResolvedValue(table === "deletedConfigProjects" ? existingTombstone : null),
          }),
        })),
      },
      scheduler: { runAfter: vi.fn() },
    } as any
  }

  const REMOVE_ARGS = {
    serverQueryToken: "valid_server_token",
    actingUserId: "user_owner",
    repoOwner: "acme",
    repoName: "docs",
  }

  it("removes all orphaned projects and inserts tombstones", async () => {
    const orphan1 = makeProject({
      _id: "orphan_1",
      configProjectId: "old-blog",
      frameworkSource: "config",
      configRemoved: true,
      name: "Old Blog",
    })
    const orphan2 = makeProject({
      _id: "orphan_2",
      configProjectId: "old-docs",
      frameworkSource: "config",
      configRemoved: true,
      name: "Old Docs",
    })
    const active = makeProject({
      _id: "active_proj",
      configProjectId: "docs",
      frameworkSource: "config",
      configRemoved: undefined,
      name: "Docs",
    })

    const patch = vi.fn()
    const insert = vi.fn().mockResolvedValue("tombstone_id")
    const ctx = createRemoveCtx({ repoProjects: [orphan1, orphan2, active], patch, insert })

    const result = await (removeAllOrphans as any).handler(ctx, REMOVE_ARGS)

    expect(result.removed).toBe(2)
    expect(result.remaining).toBe(0)

    // Should insert 2 tombstones
    const tombstoneInserts = insert.mock.calls.filter((c: any) => c[0] === "deletedConfigProjects")
    expect(tombstoneInserts).toHaveLength(2)

    // Should mark both as deleting
    expect(patch).toHaveBeenCalledWith("orphan_1", expect.objectContaining({ name: "[DELETING] Old Blog" }))
    expect(patch).toHaveBeenCalledWith("orphan_2", expect.objectContaining({ name: "[DELETING] Old Docs" }))

    // Should schedule batch cleanup for each
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(2)
  })

  it("returns removed: 0 when no orphans exist", async () => {
    const active = makeProject({
      _id: "active_proj",
      configProjectId: "docs",
      frameworkSource: "config",
      configRemoved: undefined,
      name: "Docs",
    })

    const ctx = createRemoveCtx({ repoProjects: [active] })

    const result = await (removeAllOrphans as any).handler(ctx, REMOVE_ARGS)

    expect(result.removed).toBe(0)
    expect(result.remaining).toBe(0)
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled()
  })

  it("skips projects already being deleted", async () => {
    const orphanDeleting = makeProject({
      _id: "orphan_deleting",
      configProjectId: "old-blog",
      frameworkSource: "config",
      configRemoved: true,
      name: "[DELETING] Old Blog",
    })

    const ctx = createRemoveCtx({ repoProjects: [orphanDeleting] })

    const result = await (removeAllOrphans as any).handler(ctx, REMOVE_ARGS)

    expect(result.removed).toBe(0)
  })

  it("rejects when server query token is invalid", async () => {
    verifyServerQueryTokenMock.mockResolvedValue(false)
    const ctx = createRemoveCtx()

    await expect((removeAllOrphans as any).handler(ctx, REMOVE_ARGS)).rejects.toThrow(
      "Unauthorized: invalid server query token",
    )
  })

  it("skips tombstone for non-config orphans", async () => {
    const orphanManual = makeProject({
      _id: "orphan_manual",
      frameworkSource: undefined,
      configProjectId: undefined,
      configRemoved: true,
      name: "Manual Project",
    })

    const insert = vi.fn().mockResolvedValue("tombstone_id")
    const ctx = createRemoveCtx({ repoProjects: [orphanManual], insert })

    const result = await (removeAllOrphans as any).handler(ctx, REMOVE_ARGS)

    expect(result.removed).toBe(1)
    // No tombstone should be inserted for non-config projects
    const tombstoneInserts = insert.mock.calls.filter((c: any) => c[0] === "deletedConfigProjects")
    expect(tombstoneInserts).toHaveLength(0)
  })

  it("dedupes tombstones - skips insert when tombstone already exists", async () => {
    const orphan = makeProject({
      _id: "orphan_dup",
      configProjectId: "old-blog",
      frameworkSource: "config",
      configRemoved: true,
      name: "Old Blog",
    })

    const insert = vi.fn().mockResolvedValue("tombstone_id")
    const existingTombstone = { _id: "existing_tombstone", configProjectId: "old-blog" }
    const ctx = createRemoveCtx({ repoProjects: [orphan], insert, existingTombstone })

    const result = await (removeAllOrphans as any).handler(ctx, REMOVE_ARGS)

    expect(result.removed).toBe(1)
    // Should NOT insert a tombstone since one already exists
    const tombstoneInserts = insert.mock.calls.filter((c: any) => c[0] === "deletedConfigProjects")
    expect(tombstoneInserts).toHaveLength(0)
  })
})
