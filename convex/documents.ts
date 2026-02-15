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

// Publish - update status and record the commit SHA
export const publish = mutation({
  args: {
    id: v.id("documents"),
    commitSha: v.string(),
    editedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    // Create history entry
    if (doc.body) {
      await ctx.db.insert("documentHistory", {
        documentId: args.id,
        body: doc.body,
        frontmatter: doc.frontmatter,
        editedBy: args.editedBy,
        commitSha: args.commitSha,
        message: "Published to GitHub",
        createdAt: Date.now(),
      })
    }

    await ctx.db.patch(args.id, {
      status: "published",
      githubSha: args.commitSha,
      lastSyncedAt: Date.now(),
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
