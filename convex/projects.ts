import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { MutationCtx } from "./_generated/server"
import { internalMutation, internalQuery, mutation, query } from "./_generated/server"
import { authComponent } from "./auth"

/**
 * Verify that the caller is the user they claim to be.
 * - OAuth users: checks auth identity from session token
 * - PAT users (no auth session): rejected
 */
async function verifyCallerIdentity(ctx: MutationCtx, claimedUserId: string) {
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
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const getByRepo = query({
  args: {
    userId: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
  },
  handler: async (ctx, args) => {
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
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("projects")
      .withIndex("by_repo", (q) => q.eq("repoOwner", args.repoOwner).eq("repoName", args.repoName))

    if (args.branch) {
      return await q.filter((q) => q.eq(q.field("branch"), args.branch)).first()
    }
    return await q.first()
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
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const syncProjectsFromConfig = mutation({
  args: {
    userId: v.string(),
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
    await verifyCallerIdentity(ctx, args.userId)

    const syncedProjectIds = []
    const repoProjects = await ctx.db
      .query("projects")
      .withIndex("by_userId_repo", (q) =>
        q.eq("userId", args.userId).eq("repoOwner", args.repoOwner).eq("repoName", args.repoName),
      )
      .collect()

    for (const p of args.projects) {
      const nextBranch = p.branch || args.branch

      // 1) Preferred match: explicit config project ID.
      // 2) Legacy migration match: repo + branch + contentRoot when configProjectId was never stored.
      const existing =
        repoProjects.find((project) => project.configProjectId === p.configProjectId) ??
        repoProjects.find(
          (project) =>
            !project.configProjectId && project.branch === nextBranch && project.contentRoot === p.contentRoot,
        )

      if (existing) {
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
        syncedProjectIds.push(existing._id)
      } else {
        const now = Date.now()
        const id = await ctx.db.insert("projects", {
          userId: args.userId,
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
        syncedProjectIds.push(id)
      }
    }

    return syncedProjectIds
  },
})

export const update = mutation({
  args: {
    id: v.id("projects"),
    userId: v.string(),
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
    await verifyCallerIdentity(ctx, args.userId)

    const project = await ctx.db.get(args.id)
    if (!project) throw new Error("Project not found")
    if (project.userId !== args.userId) throw new Error("Unauthorized")

    const { id, userId: _userId, ...updates } = args
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    })
  },
})

export const updateFramework = mutation({
  args: {
    id: v.id("projects"),
    userId: v.string(),
    detectedFramework: v.string(),
    frontmatterSchema: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await verifyCallerIdentity(ctx, args.userId)

    const project = await ctx.db.get(args.id)
    if (!project) throw new Error("Project not found")
    if (project.userId !== args.userId) throw new Error("Unauthorized")

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
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyCallerIdentity(ctx, args.userId)

    const project = await ctx.db.get(args.id)
    if (!project) throw new Error("Project not found")
    if (project.userId !== args.userId) {
      throw new Error("Unauthorized")
    }

    await ctx.db.delete(args.id)
  },
})

/**
 * Fix #8: Two-phase project deletion to avoid exceeding Convex transaction limits.
 * Phase 1 (removeFull): Mark project as deleting, schedule batch cleanup.
 * Phase 2 (_removeFullBatch): Delete records in batches via scheduled mutations.
 */
export const removeFull = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user) throw new Error("Unauthorized")

    const project = await ctx.db.get(args.projectId)
    if (!project) throw new Error("Project not found")

    if (project.name.startsWith("[DELETING]")) {
      throw new Error("Project is already being deleted")
    }

    if (project.userId !== (user._id as string)) {
      throw new Error("Unauthorized")
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
