import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

/** Returns all pending explorer ops for a project. */
export const listPending = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "pending"),
      )
      .collect()
  },
})

/** Returns the first explorer op matching project + filePath. */
export const getByFilePath = query({
  args: {
    projectId: v.id("projects"),
    filePath: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_filePath", (q) =>
        q.eq("projectId", args.projectId).eq("filePath", args.filePath),
      )
      .first()
  },
})

/**
 * Stage a file creation in the explorer.
 * Creates (or resets) the associated document record and inserts a pending explorerOp.
 */
export const stageCreate = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.string(),
    filePath: v.string(),
    title: v.string(),
    initialBody: v.optional(v.string()),
    initialFrontmatter: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Verify ownership
    const project = await ctx.db.get(args.projectId)
    if (!project || project.userId !== args.userId) {
      throw new Error("Unauthorized")
    }

    // Check for existing pending op at this filePath
    const existingOp = await ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_filePath", (q) =>
        q.eq("projectId", args.projectId).eq("filePath", args.filePath),
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first()
    if (existingOp) {
      throw new Error("File already staged for creation")
    }

    // Check for existing document at this filePath
    const existingDoc = await ctx.db
      .query("documents")
      .withIndex("by_projectId_filePath", (q) =>
        q.eq("projectId", args.projectId).eq("filePath", args.filePath),
      )
      .first()

    const now = Date.now()

    if (existingDoc) {
      // Edge case #5: If published or archived, reset to draft
      if (existingDoc.status === "published" || existingDoc.status === "archived") {
        await ctx.db.patch(existingDoc._id, {
          status: "draft",
          githubSha: undefined,
          publishedAt: undefined,
          ...(args.title ? { title: args.title } : {}),
          ...(args.initialBody !== undefined ? { body: args.initialBody } : {}),
          ...(args.initialFrontmatter !== undefined
            ? { frontmatter: args.initialFrontmatter }
            : {}),
          updatedAt: now,
        })
      } else {
        // Edge case #7: Patch title/body if provided and they differ
        const patches: Record<string, unknown> = { updatedAt: now }
        if (args.title && args.title !== existingDoc.title) {
          patches.title = args.title
        }
        if (args.initialBody !== undefined && args.initialBody !== existingDoc.body) {
          patches.body = args.initialBody
        }
        if (args.initialFrontmatter !== undefined) {
          patches.frontmatter = args.initialFrontmatter
        }
        if (Object.keys(patches).length > 1) {
          // More than just updatedAt
          await ctx.db.patch(existingDoc._id, patches)
        }
      }
    } else {
      // Create a new document in draft status
      await ctx.db.insert("documents", {
        projectId: args.projectId,
        filePath: args.filePath,
        title: args.title,
        status: "draft",
        body: args.initialBody,
        frontmatter: args.initialFrontmatter,
        createdAt: now,
        updatedAt: now,
      })
    }

    // Insert the explorerOp
    const opId = await ctx.db.insert("explorerOps", {
      projectId: args.projectId,
      userId: args.userId,
      opType: "create",
      filePath: args.filePath,
      initialBody: args.initialBody,
      initialFrontmatter: args.initialFrontmatter,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })

    return opId
  },
})

/**
 * Stage a file deletion in the explorer.
 * Records the intent to delete; actual deletion happens on commit/publish.
 */
export const stageDelete = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.string(),
    filePath: v.string(),
    previousSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify ownership
    const project = await ctx.db.get(args.projectId)
    if (!project || project.userId !== args.userId) {
      throw new Error("Unauthorized")
    }

    // Check for existing pending op at this path
    const existingOp = await ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_filePath", (q) =>
        q.eq("projectId", args.projectId).eq("filePath", args.filePath),
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first()
    if (existingOp) {
      throw new Error("File already has a pending operation")
    }

    const now = Date.now()
    const opId = await ctx.db.insert("explorerOps", {
      projectId: args.projectId,
      userId: args.userId,
      opType: "delete",
      filePath: args.filePath,
      previousSha: args.previousSha,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })

    return opId
  },
})

/**
 * Undo a pending explorer op.
 * If the op was a "create", also removes the associated draft document.
 */
export const undoOp = mutation({
  args: {
    id: v.id("explorerOps"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.id)
    if (!op) throw new Error("Explorer op not found")
    if (op.status !== "pending") {
      throw new Error("Can only undo pending operations")
    }

    // Verify ownership via project
    const project = await ctx.db.get(op.projectId)
    if (!project || project.userId !== args.userId) {
      throw new Error("Unauthorized")
    }

    // Mark the op as undone
    await ctx.db.patch(args.id, {
      status: "undone",
      updatedAt: Date.now(),
    })

    // If this was a create op, clean up the associated draft document
    if (op.opType === "create") {
      const doc = await ctx.db
        .query("documents")
        .withIndex("by_projectId_filePath", (q) =>
          q.eq("projectId", op.projectId).eq("filePath", op.filePath),
        )
        .first()
      if (doc && doc.status === "draft") {
        await ctx.db.delete(doc._id)
      }
    }
  },
})

/**
 * Mark a batch of explorer ops as committed after a successful GitHub commit.
 */
export const markCommitted = mutation({
  args: {
    ids: v.array(v.id("explorerOps")),
    commitSha: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    for (const id of args.ids) {
      const op = await ctx.db.get(id)
      // Only mark ops that are still pending (avoid overwriting concurrent undos)
      if (op && op.status === "pending") {
        await ctx.db.patch(id, {
          status: "committed",
          commitSha: args.commitSha,
          updatedAt: now,
        })
      }
    }
  },
})

/**
 * Remove all committed explorer ops for a project (cleanup after publish).
 */
export const clearCommittedForProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const committed = await ctx.db
      .query("explorerOps")
      .withIndex("by_projectId_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "committed"),
      )
      .collect()
    for (const op of committed) {
      await ctx.db.delete(op._id)
    }
  },
})
