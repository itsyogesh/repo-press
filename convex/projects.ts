import { v } from "convex/values"
import { verifyProjectAccessToken, verifyServerQueryToken } from "../lib/project-access-token"
import { internal } from "./_generated/api"
import { internalMutation, internalQuery, mutation, query } from "./_generated/server"
import { authComponent } from "./auth"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"

/**
 * Verify that the caller is the user they claim to be (OAuth session check).
 * Used only for project creation where no projectId exists yet.
 */
async function verifyCallerIdentity(ctx: Parameters<typeof authComponent.safeGetAuthUser>[0], claimedUserId: string) {
  const authUser = await authComponent.safeGetAuthUser(ctx)
  if (authUser) {
    if ((authUser._id as string) !== claimedUserId) {
      throw new Error("Unauthorized: caller identity does not match userId")
    }
    return
  }
  throw new Error("Unauthorized: Not authenticated")
}

export const list = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect()
  },
})

// Authenticated version — gets projects for the current logged-in user.
// Uses the auth component's user ID (which lives in a different table namespace
// than the app's "users" table), so we query by matching IDs as strings.
export const listMyProjects = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user) return []

    const userId = user._id as string
    return await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect()
  },
})

export const listMyProjectsForRepo = query({
  args: { repoOwner: v.string(), repoName: v.string() },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user) return []

    const userId = user._id as string
    return await ctx.db
      .query("projects")
      .withIndex("by_userId_repo", (q) =>
        q.eq("userId", userId).eq("repoOwner", args.repoOwner).eq("repoName", args.repoName),
      )
      .collect()
  },
})

export const get = query({
  args: {
    id: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    serverQueryToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id)
    if (!project) return null

    // 1. OAuth session (covers all client-side calls via ConvexReactClient)
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (authUser) {
      const authUserId = authUser._id as string
      if (project.userId === authUserId) return project

      const cached = await ctx.db
        .query("repoAccessCache")
        .withIndex("by_repo_userId", (q) =>
          q.eq("repoOwner", project.repoOwner).eq("repoName", project.repoName).eq("userId", authUserId),
        )
        .first()
      if (cached && cached.expiresAt > Date.now()) return project

      return null
    }

    // 2. Auth args (projectAccessToken / userId for PAT paths)
    if (args.userId || args.projectAccessToken) {
      const access = await resolveProjectReader(ctx, {
        projectId: args.id,
        userId: args.userId,
        projectAccessToken: args.projectAccessToken,
      })
      if (!access) return null
      return project
    }

    // 3. Server query token (ConvexHttpClient calls from route handlers / server components)
    if (await verifyServerQueryToken(args.serverQueryToken)) {
      return project
    }

    return null
  },
})

export const getByRepo = query({
  args: {
    userId: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify caller identity when OAuth session exists
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (authUser && (authUser._id as string) !== args.userId) {
      return []
    }

    return await ctx.db
      .query("projects")
      .withIndex("by_userId_repo", (q) =>
        q.eq("userId", args.userId).eq("repoOwner", args.repoOwner).eq("repoName", args.repoName),
      )
      .collect()
  },
})

// Server-side lookup by repo owner/name. Uses the by_repo index (no userId required).
// Optionally filters by branch. Returns the first matching project.
export const findByRepo = query({
  args: {
    repoOwner: v.string(),
    repoName: v.string(),
    branch: v.optional(v.string()),
    serverQueryToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("projects")
      .withIndex("by_repo", (q) => q.eq("repoOwner", args.repoOwner).eq("repoName", args.repoName))

    const project = args.branch
      ? await q.filter((q) => q.eq(q.field("branch"), args.branch)).first()
      : await q.first()

    if (!project) return null

    // 1. OAuth session (client-side)
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (authUser) {
      const authUserId = authUser._id as string
      if (project.userId === authUserId) return project

      const cached = await ctx.db
        .query("repoAccessCache")
        .withIndex("by_repo_userId", (q) =>
          q.eq("repoOwner", project.repoOwner).eq("repoName", project.repoName).eq("userId", authUserId),
        )
        .first()
      if (cached && cached.expiresAt > Date.now()) return project

      return null
    }

    // 2. Server query token (ConvexHttpClient from route handlers)
    if (await verifyServerQueryToken(args.serverQueryToken)) {
      return project
    }

    return null
  },
})

/**
 * Repo-scoped project list for collaborators. Uses by_repo index so all
 * projects for a repo are returned regardless of creator.
 *
 * Auth paths:
 * - Server-side (ConvexHttpClient): pass serverQueryToken (caller already verified via getRepoRole)
 * - Client-side (ConvexReactClient): OAuth session + ownership or cached access
 */
export const listProjectsForRepo = query({
  args: {
    repoOwner: v.string(),
    repoName: v.string(),
    serverQueryToken: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_repo", (q) => q.eq("repoOwner", args.repoOwner).eq("repoName", args.repoName))
      .collect()

    if (allProjects.length === 0) return []

    // 1. Server query token (server-side bootstrap — caller already verified GitHub access)
    if (await verifyServerQueryToken(args.serverQueryToken)) {
      return allProjects
    }

    // 2. Project access token (PAT users — token proves they passed the studio page gate)
    if (args.projectAccessToken) {
      const payload = await verifyProjectAccessToken(args.projectAccessToken)
      if (payload && payload.repoOwner === args.repoOwner && payload.repoName === args.repoName) {
        return allProjects
      }
    }

    // 3. OAuth session (client-side)
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser) return []

    const userId = authUser._id as string

    // Owner of any project in this repo → return all
    if (allProjects.some((p) => p.userId === userId)) return allProjects

    // Check repo access cache
    const cached = await ctx.db
      .query("repoAccessCache")
      .withIndex("by_repo_userId", (q) =>
        q.eq("repoOwner", args.repoOwner).eq("repoName", args.repoName).eq("userId", userId),
      )
      .first()

    if (cached && cached.expiresAt > Date.now()) return allProjects

    return []
  },
})

/**
 * Dashboard query that returns all projects the authenticated user can access:
 * own projects + projects on repos where the user has cached access.
 *
 * Note: Shared projects only appear after the user has visited a Studio page
 * for that repo (which seeds the repoAccessCache). This is an accepted
 * limitation — we can't check GitHub permissions for all repos at dashboard
 * load time. Collaborators typically arrive via direct URL, which seeds the
 * cache, and subsequent dashboard visits will show the shared projects.
 */
export const listAccessibleProjects = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser) return []

    const userId = authUser._id as string

    // Get own projects
    const ownProjects = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect()

    // Get repos where this user has cached access (non-expired)
    const cachedAccess = await ctx.db
      .query("repoAccessCache")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect()

    const now = Date.now()
    const validCache = cachedAccess.filter((c) => c.expiresAt > now)

    // For each cached repo, find projects not already in ownProjects
    const ownProjectIds = new Set(ownProjects.map((p) => p._id))
    const sharedProjects = []

    for (const cache of validCache) {
      const repoProjects = await ctx.db
        .query("projects")
        .withIndex("by_repo", (q) => q.eq("repoOwner", cache.repoOwner).eq("repoName", cache.repoName))
        .collect()

      for (const p of repoProjects) {
        if (!ownProjectIds.has(p._id)) {
          sharedProjects.push(p)
          ownProjectIds.add(p._id) // prevent dupes
        }
      }
    }

    return [...ownProjects, ...sharedProjects]
  },
})

/**
 * Server-side accessible projects query for PAT users.
 * Same logic as listAccessibleProjects but uses serverQueryToken + explicit userId
 * instead of OAuth session. Returns own projects + shared projects via repoAccessCache.
 */
export const listAccessibleProjectsForUser = query({
  args: {
    userId: v.string(),
    serverQueryToken: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await verifyServerQueryToken(args.serverQueryToken))) {
      return []
    }

    // Get own projects
    const ownProjects = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect()

    // Get repos where this user has cached access (non-expired)
    const cachedAccess = await ctx.db
      .query("repoAccessCache")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect()

    const now = Date.now()
    const validCache = cachedAccess.filter((c) => c.expiresAt > now)

    // For each cached repo, find projects not already in ownProjects
    const ownProjectIds = new Set(ownProjects.map((p) => p._id))
    const sharedProjects = []

    for (const cache of validCache) {
      const repoProjects = await ctx.db
        .query("projects")
        .withIndex("by_repo", (q) => q.eq("repoOwner", cache.repoOwner).eq("repoName", cache.repoName))
        .collect()

      for (const p of repoProjects) {
        if (!ownProjectIds.has(p._id)) {
          sharedProjects.push(p)
          ownProjectIds.add(p._id) // prevent dupes
        }
      }
    }

    return [...ownProjects, ...sharedProjects]
  },
})

export const listByRepoAndBranch = internalQuery({
  args: {
    repoOwner: v.string(),
    repoName: v.string(),
    branch: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_repo", (q) => q.eq("repoOwner", args.repoOwner).eq("repoName", args.repoName))
      .filter((q) => q.eq(q.field("branch"), args.branch))
      .collect()
  },
})

const frameworkValidator = v.optional(v.string())

const contentTypeValidator = v.union(
  v.literal("blog"),
  v.literal("docs"),
  v.literal("pages"),
  v.literal("changelog"),
  v.literal("custom"),
)

const projectArgs = {
  userId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  repoOwner: v.string(),
  repoName: v.string(),
  branch: v.string(),
  contentRoot: v.string(),
  detectedFramework: frameworkValidator,
  contentType: contentTypeValidator,
  frontmatterSchema: v.optional(v.any()),
  components: v.optional(v.any()),
}

export const create = mutation({
  args: projectArgs,
  handler: async (ctx, args) => {
    await verifyCallerIdentity(ctx, args.userId)

    const now = Date.now()
    return await ctx.db.insert("projects", {
      ...args,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    })
  },
})

// Atomically returns existing project or creates a new one.
// Prevents duplicate projects for the same user + repo + branch + contentRoot.
export const getOrCreate = mutation({
  args: projectArgs,
  handler: async (ctx, args) => {
    await verifyCallerIdentity(ctx, args.userId)

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_userId_repo", (q) =>
        q.eq("userId", args.userId).eq("repoOwner", args.repoOwner).eq("repoName", args.repoName),
      )
      .filter((q) => q.and(q.eq(q.field("branch"), args.branch), q.eq(q.field("contentRoot"), args.contentRoot)))
      .first()

    if (existing) {
      // Update framework/schema/components if re-detected values differ from stored ones
      const updates: Record<string, unknown> = {}
      if (args.detectedFramework && args.detectedFramework !== existing.detectedFramework) {
        updates.detectedFramework = args.detectedFramework
      }
      if (
        args.frontmatterSchema &&
        JSON.stringify(args.frontmatterSchema) !== JSON.stringify(existing.frontmatterSchema)
      ) {
        updates.frontmatterSchema = args.frontmatterSchema
      }
      if (args.contentType && args.contentType !== existing.contentType) {
        updates.contentType = args.contentType
      }
      if (args.components && JSON.stringify(args.components) !== JSON.stringify((existing as any).components)) {
        updates.components = args.components
      }
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existing._id, { ...updates, updatedAt: Date.now() })
      }
      return existing._id
    }

    const now = Date.now()
    return await ctx.db.insert("projects", {
      ...args,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const syncProjectsFromConfig = mutation({
  args: {
    // Auth: either OAuth session (userId) or server query token
    userId: v.optional(v.string()),
    actingUserId: v.optional(v.string()),
    serverQueryToken: v.optional(v.string()),
    repoOwner: v.string(),
    repoName: v.string(),
    branch: v.string(),
    configVersion: v.number(),
    configPath: v.string(),
    pluginRegistry: v.optional(v.any()),
    projects: v.array(
      v.object({
        configProjectId: v.string(),
        name: v.string(),
        contentRoot: v.string(),
        framework: v.string(),
        contentType: contentTypeValidator,
        branch: v.optional(v.string()),
        previewEntry: v.optional(v.string()),
        enabledPlugins: v.optional(v.array(v.string())),
        components: v.optional(v.any()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Resolve the acting user: OAuth session, explicit userId, or server query token
    let callerUserId: string | null = null

    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (authUser) {
      callerUserId = authUser._id as string
      // If userId was provided, verify it matches the session
      if (args.userId && args.userId !== callerUserId) {
        throw new Error("Unauthorized: caller identity does not match userId")
      }
    } else if (await verifyServerQueryToken(args.serverQueryToken)) {
      // Server-side call — trust actingUserId or userId
      callerUserId = args.actingUserId ?? args.userId ?? null
    } else if (args.userId) {
      // Legacy path: try to verify caller identity
      await verifyCallerIdentity(ctx, args.userId)
      callerUserId = args.userId
    }

    if (!callerUserId) {
      throw new Error("Unauthorized: no valid authentication")
    }

    const synced: string[] = []
    const created: string[] = []
    const unchanged: string[] = []

    // Repo-scoped lookup: find ALL projects for this repo, regardless of creator
    const repoProjects = await ctx.db
      .query("projects")
      .withIndex("by_repo", (q) =>
        q.eq("repoOwner", args.repoOwner).eq("repoName", args.repoName),
      )
      .collect()

    for (const p of args.projects) {
      const nextBranch = p.branch || args.branch

      // 1) Preferred match: explicit config project ID (across ALL projects for repo).
      // 2) Legacy migration match: repo + branch + contentRoot when configProjectId was never stored.
      const existing =
        repoProjects.find((project) => project.configProjectId === p.configProjectId) ??
        repoProjects.find(
          (project) =>
            !project.configProjectId && project.branch === nextBranch && project.contentRoot === p.contentRoot,
        )

      if (existing) {
        // Idempotency check: only patch if something actually changed
        const needsUpdate =
          existing.name !== p.name ||
          existing.contentRoot !== p.contentRoot ||
          existing.branch !== nextBranch ||
          existing.detectedFramework !== p.framework ||
          existing.contentType !== p.contentType ||
          existing.configProjectId !== p.configProjectId ||
          existing.configVersion !== args.configVersion ||
          existing.configPath !== args.configPath ||
          existing.previewEntry !== p.previewEntry ||
          JSON.stringify(existing.enabledPlugins) !== JSON.stringify(p.enabledPlugins) ||
          JSON.stringify(existing.pluginRegistry) !== JSON.stringify(args.pluginRegistry) ||
          JSON.stringify(existing.components) !== JSON.stringify(p.components) ||
          existing.frameworkSource !== "config"

        if (needsUpdate) {
          await ctx.db.patch(existing._id, {
            name: p.name,
            contentRoot: p.contentRoot,
            branch: nextBranch,
            detectedFramework: p.framework,
            contentType: p.contentType,
            configProjectId: p.configProjectId,
            configVersion: args.configVersion,
            configPath: args.configPath,
            previewEntry: p.previewEntry,
            enabledPlugins: p.enabledPlugins,
            pluginRegistry: args.pluginRegistry,
            components: p.components,
            frameworkSource: "config",
            updatedAt: Date.now(),
          })
          synced.push(existing._id)
        } else {
          unchanged.push(existing._id)
        }
      } else {
        const now = Date.now()
        const id = await ctx.db.insert("projects", {
          userId: callerUserId,
          createdBy: callerUserId,
          name: p.name,
          repoOwner: args.repoOwner,
          repoName: args.repoName,
          branch: nextBranch,
          contentRoot: p.contentRoot,
          detectedFramework: p.framework,
          contentType: p.contentType,
          configProjectId: p.configProjectId,
          configVersion: args.configVersion,
          configPath: args.configPath,
          previewEntry: p.previewEntry,
          enabledPlugins: p.enabledPlugins,
          pluginRegistry: args.pluginRegistry,
          components: p.components,
          frameworkSource: "config",
          createdAt: now,
          updatedAt: now,
        })
        created.push(id)
      }
    }

    return { synced, created, unchanged }
  },
})

export const update = mutation({
  args: {
    id: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    branch: v.optional(v.string()),
    contentRoot: v.optional(v.string()),
    detectedFramework: frameworkValidator,
    contentType: v.optional(contentTypeValidator),
    frontmatterSchema: v.optional(v.any()),
    components: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, { projectId: args.id, userId: args.userId, projectAccessToken: args.projectAccessToken }, "editor")

    const { id, userId: _userId, projectAccessToken: _pat, ...updates } = args
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    })
  },
})

export const updateFramework = mutation({
  args: {
    id: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
    detectedFramework: v.string(),
    frontmatterSchema: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, { projectId: args.id, userId: args.userId, projectAccessToken: args.projectAccessToken }, "editor")

    await ctx.db.patch(args.id, {
      detectedFramework: args.detectedFramework,
      frontmatterSchema: args.frontmatterSchema,
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: {
    id: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, { projectId: args.id, userId: args.userId, projectAccessToken: args.projectAccessToken }, "owner")

    await ctx.db.delete(args.id)
  },
})

/**
 * Fix #8: Two-phase project deletion to avoid exceeding Convex transaction limits.
 * Phase 1 (removeFull): Mark project as deleting, schedule batch cleanup.
 * Phase 2 (_removeFullBatch): Delete records in batches via scheduled mutations.
 */
export const removeFull = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { project } = await resolveProjectAccess(ctx, args, "owner")

    if (project.name.startsWith("[DELETING]")) {
      throw new Error("Project is already being deleted")
    }

    // Mark project as deleting to prevent access during cleanup
    await ctx.db.patch(args.projectId, {
      name: `[DELETING] ${project.name}`,
      updatedAt: Date.now(),
    })

    // Schedule the batch deletion (runs as a separate transaction)
    await ctx.scheduler.runAfter(0, internal.projects._removeFullBatch, {
      projectId: args.projectId,
      phase: "documents",
    })
  },
})

/**
 * Internal mutation that deletes project data in batches.
 * Processes up to BATCH_SIZE records per transaction, then reschedules
 * itself for the next batch to avoid transaction limits.
 */
export const _removeFullBatch = internalMutation({
  args: {
    projectId: v.id("projects"),
    phase: v.string(),
  },
  handler: async (ctx, args) => {
    const QUERY_BATCH_SIZE = 100
    const MAX_DELETES_PER_INVOCATION = 250

    const scheduleNext = async (phase: "documents" | "associated") => {
      await ctx.scheduler.runAfter(0, internal.projects._removeFullBatch, {
        projectId: args.projectId,
        phase,
      })
    }

    const project = await ctx.db.get(args.projectId)
    if (!project) {
      // Project may already be deleted by a concurrent scheduled batch.
      return
    }

    if (args.phase === "documents") {
      let deletesRemaining = MAX_DELETES_PER_INVOCATION

      // Always process the first remaining document so we can drain its history
      // before deleting the document itself.
      while (deletesRemaining > 0) {
        const [doc] = await ctx.db
          .query("documents")
          .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
          .take(1)

        if (!doc) {
          await scheduleNext("associated")
          return
        }

        const historyLimit = Math.min(QUERY_BATCH_SIZE, deletesRemaining)
        const history = await ctx.db
          .query("documentHistory")
          .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
          .take(historyLimit)

        if (history.length > 0) {
          for (const entry of history) {
            await ctx.db.delete(entry._id)
            deletesRemaining -= 1
            if (deletesRemaining === 0) {
              await scheduleNext("documents")
              return
            }
          }
          continue
        }

        await ctx.db.delete(doc._id)
        deletesRemaining -= 1

        if (deletesRemaining === 0) {
          await scheduleNext("documents")
          return
        }
      }

      await scheduleNext("documents")
      return
    }

    if (args.phase === "associated") {
      let deletesRemaining = MAX_DELETES_PER_INVOCATION
      const tables = [
        "collections",
        "authors",
        "tags",
        "categories",
        "folderMeta",
        "mediaAssets",
        "webhooks",
        "explorerOps",
        "mediaOps",
        "publishBranches",
      ] as const

      for (const table of tables) {
        while (deletesRemaining > 0) {
          const recordLimit = Math.min(QUERY_BATCH_SIZE, deletesRemaining)
          const records = await ctx.db
            .query(table as any)
            .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
            .take(recordLimit)

          if (records.length === 0) {
            break
          }

          for (const record of records) {
            await ctx.db.delete(record._id)
            deletesRemaining -= 1
            if (deletesRemaining === 0) {
              await scheduleNext("associated")
              return
            }
          }
        }
      }

      // All associated records deleted — delete the project itself
      await ctx.db.delete(args.projectId)
      return
    }

    throw new Error(`Unknown cleanup phase: ${args.phase}`)
  },
})
