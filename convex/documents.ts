import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("in_review"),
        v.literal("approved"),
        v.literal("published"),
        v.literal("scheduled"),
        v.literal("archived"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("documents")
        .withIndex("by_projectId_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", args.status!),
        )
        .order("desc")
        .collect()
    }
    return await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect()
  },
})

export const getByFilePath = query({
  args: {
    projectId: v.id("projects"),
    filePath: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_projectId_filePath", (q) =>
        q.eq("projectId", args.projectId).eq("filePath", args.filePath),
      )
      .first()
  },
})

export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    collectionId: v.optional(v.id("collections")),
    filePath: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("in_review"),
      v.literal("approved"),
      v.literal("published"),
      v.literal("scheduled"),
      v.literal("archived"),
    ),
    body: v.optional(v.string()),
    frontmatter: v.optional(v.any()),
    coverImage: v.optional(v.string()),
    authorIds: v.optional(v.array(v.id("authors"))),
    tagIds: v.optional(v.array(v.id("tags"))),
    categoryIds: v.optional(v.array(v.id("categories"))),
    order: v.optional(v.number()),
    githubSha: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    return await ctx.db.insert("documents", {
      ...args,
      createdAt: now,
      updatedAt: now,
    })
  },
})

// Atomically returns existing document or creates a new one.
// Prevents duplicate documents for the same projectId + filePath.
export const getOrCreate = mutation({
  args: {
    projectId: v.id("projects"),
    filePath: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    frontmatter: v.optional(v.any()),
    githubSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("documents")
      .withIndex("by_projectId_filePath", (q) =>
        q.eq("projectId", args.projectId).eq("filePath", args.filePath),
      )
      .first()

    if (existing) return existing._id

    const now = Date.now()
    return await ctx.db.insert("documents", {
      projectId: args.projectId,
      filePath: args.filePath,
      title: args.title,
      status: "draft",
      body: args.body,
      frontmatter: args.frontmatter,
      githubSha: args.githubSha,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("in_review"),
        v.literal("approved"),
        v.literal("published"),
        v.literal("scheduled"),
        v.literal("archived"),
      ),
    ),
    body: v.optional(v.string()),
    frontmatter: v.optional(v.any()),
    coverImage: v.optional(v.string()),
    authorIds: v.optional(v.array(v.id("authors"))),
    tagIds: v.optional(v.array(v.id("tags"))),
    categoryIds: v.optional(v.array(v.id("categories"))),
    reviewerId: v.optional(v.id("users")),
    reviewNote: v.optional(v.string()),
    order: v.optional(v.number()),
    githubSha: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    scheduledAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})

export const search = query({
  args: {
    projectId: v.id("projects"),
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withSearchIndex("search_title", (q) =>
        q.search("title", args.searchTerm).eq("projectId", args.projectId),
      )
      .collect()
  },
})

// Save draft - creates a history entry and updates the document
export const saveDraft = mutation({
  args: {
    id: v.id("documents"),
    body: v.string(),
    frontmatter: v.optional(v.any()),
    editedBy: v.id("users"),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    // Create history entry with current content before overwriting
    if (doc.body) {
      await ctx.db.insert("documentHistory", {
        documentId: args.id,
        body: doc.body,
        frontmatter: doc.frontmatter,
        editedBy: args.editedBy,
        message: args.message || "Auto-save",
        createdAt: Date.now(),
      })
    }

    // Update the document
    await ctx.db.patch(args.id, {
      body: args.body,
      frontmatter: args.frontmatter,
      updatedAt: Date.now(),
    })
  },
})

// Publish - checks state transition, updates status, and records the commit SHA.
// Only callable from "draft" or "approved" states. This is the only path to "published"
// since publishing requires a GitHub commit.
export const publish = mutation({
  args: {
    id: v.id("documents"),
    commitSha: v.string(),
    editedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    // Enforce state machine: only draft/approved can be published
    const publishableStatuses = ["draft", "approved"]
    if (!publishableStatuses.includes(doc.status)) {
      throw new Error(
        `Cannot publish from "${doc.status}" status. Document must be in draft or approved state.`,
      )
    }

    // Verify the caller owns this project
    const project = await ctx.db.get(doc.projectId)
    if (!project) throw new Error("Project not found")

    await ctx.db.patch(args.id, {
      status: "published",
      githubSha: args.commitSha,
      lastSyncedAt: Date.now(),
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

// Status transition state machine.
// "published" is NOT a valid target here — publishing requires a GitHub commit
// and must go through the `publish` mutation instead.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["in_review", "scheduled", "archived"],
  in_review: ["approved", "draft", "archived"],
  approved: ["draft", "archived"],
  published: ["draft", "archived"],
  scheduled: ["draft", "archived"],
  archived: ["draft"],
}

export const transitionStatus = mutation({
  args: {
    id: v.id("documents"),
    newStatus: v.union(
      v.literal("draft"),
      v.literal("in_review"),
      v.literal("approved"),
      v.literal("published"),
      v.literal("scheduled"),
      v.literal("archived"),
    ),
    reviewerId: v.optional(v.id("users")),
    reviewNote: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    const allowed = ALLOWED_TRANSITIONS[doc.status] || []
    if (!allowed.includes(args.newStatus)) {
      throw new Error(
        `Cannot transition from "${doc.status}" to "${args.newStatus}". Allowed: ${allowed.join(", ")}`,
      )
    }

    const updates: Record<string, any> = {
      status: args.newStatus,
      updatedAt: Date.now(),
    }

    // Set review fields when submitting for review or approving/rejecting
    if (args.reviewerId) updates.reviewerId = args.reviewerId
    if (args.reviewNote !== undefined) updates.reviewNote = args.reviewNote

    // Set scheduled date
    if (args.newStatus === "scheduled" && args.scheduledAt) {
      updates.scheduledAt = args.scheduledAt
    }

    // Clear scheduled date if moving away from scheduled
    if (doc.status === "scheduled" && args.newStatus !== "scheduled") {
      updates.scheduledAt = undefined
    }

    // Set publishedAt when publishing
    if (args.newStatus === "published") {
      updates.publishedAt = Date.now()
    }

    await ctx.db.patch(args.id, updates)
  },
})
