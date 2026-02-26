import { v } from "convex/values"
import { api } from "./_generated/api"
import { action, internalMutation, mutation, query } from "./_generated/server"

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
        .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", args.status!))
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
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
      .first()
  },
})

export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

// Internal only — not callable from the client. Use getOrCreate for client-facing usage.
export const create = internalMutation({
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
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
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

// Generic update for document metadata. Status changes are NOT allowed here —
// use `publish` or `transitionStatus` instead.
export const update = mutation({
  args: {
    id: v.id("documents"),
    userId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    slug: v.optional(v.string()),
    body: v.optional(v.string()),
    frontmatter: v.optional(v.any()),
    coverImage: v.optional(v.string()),
    authorIds: v.optional(v.array(v.id("authors"))),
    tagIds: v.optional(v.array(v.id("tags"))),
    categoryIds: v.optional(v.array(v.id("categories"))),
    order: v.optional(v.number()),
    githubSha: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    scheduledAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, userId, ...updates } = args

    // Verify ownership
    const doc = await ctx.db.get(id)
    if (!doc) throw new Error("Document not found")
    const project = await ctx.db.get(doc.projectId)
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized")
    }

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
      .withSearchIndex("search_title", (q) => q.search("title", args.searchTerm).eq("projectId", args.projectId))
      .collect()
  },
})

// Save draft - creates a history entry and updates the document
export const saveDraft = mutation({
  args: {
    id: v.id("documents"),
    body: v.string(),
    frontmatter: v.optional(v.any()),
    editedBy: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    // Verify ownership: editedBy must own the project
    const project = await ctx.db.get(doc.projectId)
    if (!project || project.userId !== args.editedBy) {
      throw new Error("Unauthorized")
    }

    // Auto-transition published->draft when editing (edge case #6)
    if (doc.status === "published") {
      await ctx.db.patch(args.id, { status: "draft" })
    }

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
    editedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    // Enforce state machine: only draft/approved can be published
    const publishableStatuses = ["draft", "approved"]
    if (!publishableStatuses.includes(doc.status)) {
      throw new Error(`Cannot publish from "${doc.status}" status. Document must be in draft or approved state.`)
    }

    // Verify ownership: editedBy must own the project
    const project = await ctx.db.get(doc.projectId)
    if (!project || project.userId !== args.editedBy) {
      throw new Error("Unauthorized")
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
      v.literal("scheduled"),
      v.literal("archived"),
    ),
    reviewerId: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    // Verify ownership
    if (args.reviewerId) {
      const project = await ctx.db.get(doc.projectId)
      if (!project || project.userId !== args.reviewerId) {
        throw new Error("Unauthorized")
      }
    }

    const allowed = ALLOWED_TRANSITIONS[doc.status] || []
    if (!allowed.includes(args.newStatus)) {
      throw new Error(`Cannot transition from "${doc.status}" to "${args.newStatus}". Allowed: ${allowed.join(", ")}`)
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

    await ctx.db.patch(args.id, updates)
  },
})

/**
 * Publish a document from a GitHub webhook (PR merge).
 * Verifies ownership via publishBranches -> project chain.
 * Handles documents in any status by transitioning through draft first.
 * Idempotent: skips already-published documents.
 */
export const publishFromWebhook = internalMutation({
  args: {
    documentId: v.id("documents"),
    projectId: v.id("projects"),
    commitSha: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return // Document may have been deleted

    // Idempotent: skip if already published (edge case #8)
    if (doc.status === "published") return

    // Verify the document belongs to this project
    if (doc.projectId !== args.projectId) {
      throw new Error("Document does not belong to the specified project")
    }

    // Handle non-publishable states by transitioning to draft first (edge case #2)
    const publishableStatuses = ["draft", "approved"]
    if (!publishableStatuses.includes(doc.status)) {
      // Transition to draft first (all statuses can go to draft per ALLOWED_TRANSITIONS)
      await ctx.db.patch(args.documentId, {
        status: "draft",
        updatedAt: Date.now(),
      })
    }

    // Now publish
    await ctx.db.patch(args.documentId, {
      status: "published",
      githubSha: args.commitSha,
      lastSyncedAt: Date.now(),
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

// ─── File Tree Titles (Studio V2) ──────────────────────────────

/** Returns filePath -> title pairs for all documents in a project. */
export const listTitlesForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect()
    return docs.map((d) => ({ filePath: d.filePath, title: d.title }))
  },
})

/** Returns documents in draft/approved status that have body content not yet committed.
 * A document is considered dirty if it's in draft/approved status with body content. */
export const listDirtyForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const drafts = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "draft"))
      .collect()
    const approved = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "approved"))
      .collect()
    return [...drafts, ...approved].filter((d) => d.body != null)
  },
})

/**
 * Background action: syncs file tree titles by creating document records
 * for files that don't already have one. Fetches content from GitHub
 * to extract the title from frontmatter.
 */
export const syncTreeTitles = action({
  args: {
    projectId: v.id("projects"),
    owner: v.string(),
    repo: v.string(),
    branch: v.string(),
    files: v.array(v.object({ path: v.string(), sha: v.string() })),
    githubToken: v.string(),
  },
  handler: async (ctx, args) => {
    // Check which files already have document records
    const existingDocs = await ctx.runQuery(api.documents.listByProject, {
      projectId: args.projectId,
    })
    const existingPaths = new Set(existingDocs.map((d) => d.filePath))

    const missingFiles = args.files.filter((f) => !existingPaths.has(f.path))
    if (missingFiles.length === 0) return

    // Fetch and sync in batches of 5 to avoid rate limits
    const BATCH_SIZE = 5
    for (let i = 0; i < missingFiles.length; i += BATCH_SIZE) {
      const batch = missingFiles.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (file) => {
          try {
            const response = await fetch(
              `https://api.github.com/repos/${args.owner}/${args.repo}/contents/${encodeURIComponent(file.path)}?ref=${args.branch}`,
              {
                headers: {
                  Authorization: `token ${args.githubToken}`,
                  Accept: "application/vnd.github.v3.raw",
                },
              },
            )
            if (!response.ok) return

            const content = await response.text()

            // Extract title from frontmatter (simple regex — no gray-matter in Convex)
            let title =
              file.path
                .split("/")
                .pop()
                ?.replace(/\.(mdx?|markdown)$/i, "") || file.path
            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
            if (fmMatch) {
              const titleMatch = fmMatch[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)
              if (titleMatch) title = titleMatch[1].trim()
            }

            await ctx.runMutation(api.documents.getOrCreate, {
              projectId: args.projectId,
              filePath: file.path,
              title,
              githubSha: file.sha,
            })
          } catch {
            // Skip files that fail to fetch
          }
        }),
      )
    }
  },
})
