import { v } from "convex/values"
import { DOCUMENT_ALLOWED_TRANSITIONS, isPublishableDocumentStatus } from "../lib/document-status"
import {
  assertContentPath,
  resolveStoredContentPath,
  type StoredPathRepresentation,
  toRepoPath,
} from "../lib/preview/path-policy"
import { verifyServerQueryToken } from "../lib/project-access-token"
import { internal } from "./_generated/api"
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server"
import { resolveProjectAccess, resolveProjectReader } from "./lib/access"
import { isDocumentContentClean } from "./lib/documentCleanliness"
import {
  assertGitHubCommitSha,
  authorizeGitHubProjectActor,
  verifyGitHubProjectReadAccess,
} from "./lib/githubActionAccess"
import { requireCommittedAttempt, requireDocumentAssociation } from "./lib/publishAttemptOwnership"

const TITLE_SYNC_MAX_PATH_BYTES = 1_024
const TITLE_SYNC_MAX_TOTAL_PATH_BYTES = 128 * 1_024
const TITLE_SYNC_MAX_CONTENT_BYTES = 256 * 1_024
const TITLE_SYNC_MAX_FILES = 256
const TITLE_SYNC_MAX_TITLE_BYTES = 512
const TITLE_SYNC_MAX_TITLE_CODE_POINTS = 512
const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder("utf-8", { fatal: true })

type NormalizedTitleSyncDocument = Readonly<{
  filePath: string
  title: string
  githubSha: string
}>

function normalizeBoundedTitle(value: string): string | null {
  const nfcValue = value.normalize("NFC")
  for (const character of nfcValue) {
    const codePoint = character.codePointAt(0)!
    const isUnsafe =
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x061c ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      (codePoint >= 0x2028 && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x206f) ||
      codePoint === 0xfeff
    if (isUnsafe) return null
  }

  const title = nfcValue.trim()
  if (
    title.length === 0 ||
    Array.from(title).length > TITLE_SYNC_MAX_TITLE_CODE_POINTS ||
    utf8Encoder.encode(title).byteLength > TITLE_SYNC_MAX_TITLE_BYTES
  ) {
    return null
  }
  return title
}

function titleFromContent(filePath: string, content: string): string {
  const fileName = filePath.split("/").pop() ?? filePath
  const fileNameStem = fileName.replace(/\.(mdx?|markdown)$/i, "")
  const fallbackTitle = normalizeBoundedTitle(fileNameStem) ?? "Untitled"
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) return fallbackTitle

  const titleMatch = fmMatch[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)
  if (!titleMatch) return fallbackTitle
  return normalizeBoundedTitle(titleMatch[1]) ?? fallbackTitle
}

function validateTitleSyncBatch(
  documents: readonly NormalizedTitleSyncDocument[],
): readonly NormalizedTitleSyncDocument[] {
  if (!Array.isArray(documents) || Object.getPrototypeOf(documents) !== Array.prototype) {
    throw new Error("Invalid title document batch")
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(documents, "length")
  if (
    !lengthDescriptor ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > TITLE_SYNC_MAX_FILES ||
    lengthDescriptor.enumerable !== false ||
    lengthDescriptor.configurable !== false
  ) {
    throw new Error(`title document batch exceeds ${TITLE_SYNC_MAX_FILES} entries`)
  }

  const length = lengthDescriptor.value
  const expectedArrayKeys = new Set<PropertyKey>(["length"])
  for (let index = 0; index < length; index++) expectedArrayKeys.add(String(index))
  const arrayKeys = Reflect.ownKeys(documents)
  if (arrayKeys.length !== expectedArrayKeys.size || arrayKeys.some((key) => !expectedArrayKeys.has(key))) {
    throw new Error("Invalid title document batch")
  }

  const seenPaths = new Set<string>()
  const snapshots: NormalizedTitleSyncDocument[] = []
  let totalPathBytes = 0
  for (let index = 0; index < length; index++) {
    const indexDescriptor = Object.getOwnPropertyDescriptor(documents, String(index))
    if (!indexDescriptor || !("value" in indexDescriptor) || indexDescriptor.enumerable !== true) {
      throw new Error("Invalid title document batch")
    }

    const document = indexDescriptor.value
    if (document === null || typeof document !== "object" || Array.isArray(document)) {
      throw new Error("Invalid title document batch")
    }
    const prototype = Object.getPrototypeOf(document)
    if (prototype !== Object.prototype && prototype !== null) throw new Error("Invalid title document batch")

    const expectedDocumentKeys = new Set<PropertyKey>(["filePath", "title", "githubSha"])
    const documentKeys = Reflect.ownKeys(document)
    if (
      documentKeys.length !== expectedDocumentKeys.size ||
      documentKeys.some((key) => !expectedDocumentKeys.has(key))
    ) {
      throw new Error("Invalid title document batch")
    }

    const filePathDescriptor = Object.getOwnPropertyDescriptor(document, "filePath")
    const titleDescriptor = Object.getOwnPropertyDescriptor(document, "title")
    const githubShaDescriptor = Object.getOwnPropertyDescriptor(document, "githubSha")
    if (
      !filePathDescriptor ||
      !("value" in filePathDescriptor) ||
      filePathDescriptor.enumerable !== true ||
      typeof filePathDescriptor.value !== "string" ||
      !titleDescriptor ||
      !("value" in titleDescriptor) ||
      titleDescriptor.enumerable !== true ||
      typeof titleDescriptor.value !== "string" ||
      !githubShaDescriptor ||
      !("value" in githubShaDescriptor) ||
      githubShaDescriptor.enumerable !== true ||
      typeof githubShaDescriptor.value !== "string"
    ) {
      throw new Error("Invalid title document batch")
    }

    const filePathValue = filePathDescriptor.value
    const titleValue = titleDescriptor.value
    const githubShaValue = githubShaDescriptor.value
    const pathBytes = utf8Encoder.encode(filePathValue).byteLength
    if (pathBytes > TITLE_SYNC_MAX_PATH_BYTES) {
      throw new Error(`content path exceeds ${TITLE_SYNC_MAX_PATH_BYTES} bytes`)
    }
    totalPathBytes += pathBytes
    if (totalPathBytes > TITLE_SYNC_MAX_TOTAL_PATH_BYTES) {
      throw new Error(`total path bytes exceed ${TITLE_SYNC_MAX_TOTAL_PATH_BYTES}`)
    }

    const filePath = assertContentPath(filePathValue)
    if (filePath !== filePathValue || !/\.(?:md|mdx|markdown)$/i.test(filePath)) {
      throw new Error("Invalid title document path")
    }
    if (seenPaths.has(filePath)) throw new Error("Duplicate title document path")
    seenPaths.add(filePath)
    assertGitHubCommitSha(githubShaValue, "file sha")

    const normalizedTitle = normalizeBoundedTitle(titleValue)
    if (normalizedTitle === null || normalizedTitle !== titleValue) {
      throw new Error("Invalid title document title")
    }

    snapshots.push(
      Object.freeze({
        filePath,
        title: normalizedTitle,
        githubSha: githubShaValue,
      }),
    )
  }

  return Object.freeze(snapshots)
}

function decodeTitleSyncContent(payload: {
  type?: string
  size?: number
  encoding?: string
  content?: string
}): string | null {
  if (
    payload.type !== "file" ||
    payload.encoding !== "base64" ||
    typeof payload.content !== "string" ||
    typeof payload.size !== "number" ||
    !Number.isInteger(payload.size) ||
    payload.size < 0 ||
    payload.size > TITLE_SYNC_MAX_CONTENT_BYTES
  ) {
    return null
  }

  const compactBase64 = payload.content.replace(/\s/g, "")
  if (compactBase64.length > Math.ceil((TITLE_SYNC_MAX_CONTENT_BYTES * 4) / 3) + 4) return null

  try {
    const binary = atob(compactBase64)
    if (binary.length > TITLE_SYNC_MAX_CONTENT_BYTES || binary.length !== payload.size) return null
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return utf8Decoder.decode(bytes)
  } catch {
    return null
  }
}

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
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
    const access = await resolveProjectReader(ctx, args)
    if (!access) return []

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

/** Internal version of listByProject - no auth, for use by actions like syncTreeTitles. */
export const listByProjectInternal = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
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
    pathRepresentation: v.union(v.literal("legacy_repo_v0"), v.literal("content_relative_v1")),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return null

    const indexed = ctx.db
      .query("documents")
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
    return await indexed
      .filter((q) =>
        args.pathRepresentation === "content_relative_v1"
          ? q.eq(q.field("pathRepresentation"), "content_relative_v1")
          : q.or(q.eq(q.field("pathRepresentation"), "legacy_repo_v0"), q.eq(q.field("pathRepresentation"), undefined)),
      )
      .first()
  },
})

export const get = query({
  args: {
    id: v.id("documents"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) return null

    const access = await resolveProjectReader(ctx, {
      projectId: doc.projectId,
      userId: args.userId,
      projectAccessToken: args.projectAccessToken,
    })
    if (!access) return null

    return doc
  },
})

// Internal only - not callable from the client. Use getOrCreate for client-facing usage.
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
      pathRepresentation: "content_relative_v1",
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
    pathRepresentation: v.literal("content_relative_v1"),
    title: v.string(),
    body: v.optional(v.string()),
    frontmatter: v.optional(v.any()),
    githubSha: v.optional(v.string()),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveProjectAccess(ctx, args, "editor")

    const existing = await ctx.db
      .query("documents")
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
      .filter((q) => q.eq(q.field("pathRepresentation"), args.pathRepresentation))
      .first()

    if (existing) return existing._id

    const now = Date.now()
    return await ctx.db.insert("documents", {
      projectId: args.projectId,
      filePath: args.filePath,
      pathRepresentation: args.pathRepresentation,
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

export const getOrCreateInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    filePath: v.string(),
    pathRepresentation: v.literal("content_relative_v1"),
    title: v.string(),
    body: v.optional(v.string()),
    frontmatter: v.optional(v.any()),
    githubSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("documents")
      .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", args.filePath))
      .filter((q) => q.eq(q.field("pathRepresentation"), args.pathRepresentation))
      .first()

    if (existing) return existing._id

    const now = Date.now()
    return await ctx.db.insert("documents", {
      projectId: args.projectId,
      filePath: args.filePath,
      pathRepresentation: args.pathRepresentation,
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

/** Persists a fully validated title sync as one atomic Convex transaction. */
export const getOrCreateTitleSyncBatchInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    documents: v.array(
      v.object({
        filePath: v.string(),
        title: v.string(),
        githubSha: v.string(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{ inserted: number; existing: number }> => {
    const documents = validateTitleSyncBatch(args.documents)
    let inserted = 0
    let existing = 0

    for (const document of documents) {
      const found = await ctx.db
        .query("documents")
        .withIndex("by_projectId_filePath", (q) => q.eq("projectId", args.projectId).eq("filePath", document.filePath))
        .filter((q) => q.eq(q.field("pathRepresentation"), "content_relative_v1"))
        .first()
      if (found) {
        existing += 1
        continue
      }

      const now = Date.now()
      await ctx.db.insert("documents", {
        projectId: args.projectId,
        filePath: document.filePath,
        pathRepresentation: "content_relative_v1",
        title: document.title,
        status: "draft",
        githubSha: document.githubSha,
        createdAt: now,
        updatedAt: now,
      })
      inserted += 1
    }

    return { inserted, existing }
  },
})

// Generic update for document metadata. Status changes are NOT allowed here -
// use `publish` or `transitionStatus` instead.
export const update = mutation({
  args: {
    id: v.id("documents"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
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
    const { id, userId, projectAccessToken, ...updates } = args

    const doc = await ctx.db.get(id)
    if (!doc) throw new Error("Document not found")
    await resolveProjectAccess(ctx, { projectId: doc.projectId, userId, projectAccessToken }, "editor")

    // Only content writes advance the content version; metadata-only
    // updates keep publish cleanliness intact.
    const writesContent = "body" in updates || "frontmatter" in updates
    await ctx.db.patch(id, {
      ...updates,
      ...(writesContent ? { contentVersion: (doc.contentVersion ?? 0) + 1 } : {}),
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: {
    id: v.id("documents"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    await resolveProjectAccess(
      ctx,
      {
        projectId: doc.projectId,
        userId: args.userId,
        projectAccessToken: args.projectAccessToken,
      },
      "editor",
    )

    await ctx.db.delete(args.id)
  },
})

export const search = query({
  args: {
    projectId: v.id("projects"),
    searchTerm: v.string(),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return []

    return await ctx.db
      .query("documents")
      .withSearchIndex("search_title", (q) => q.search("title", args.searchTerm).eq("projectId", args.projectId))
      .collect()
  },
})

export const hasContentForProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return true // fail closed - assume content exists if unauthorized

    const firstDoc = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first()
    if (firstDoc) return true

    const firstFolder = await ctx.db
      .query("folderMeta")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first()
    if (firstFolder) return true

    const firstCollection = await ctx.db
      .query("collections")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first()
    if (firstCollection) return true

    return false
  },
})

// Save draft - creates a history entry and updates the document
export const saveDraft = mutation({
  args: {
    id: v.id("documents"),
    expectedUpdatedAt: v.optional(v.number()),
    body: v.string(),
    frontmatter: v.optional(v.any()),
    message: v.optional(v.string()),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    const { userId } = await resolveProjectAccess(
      ctx,
      {
        projectId: doc.projectId,
        userId: args.userId,
        projectAccessToken: args.projectAccessToken,
      },
      "editor",
    )

    if (args.expectedUpdatedAt !== undefined && doc.updatedAt !== args.expectedUpdatedAt) {
      throw new Error("Document was modified by another user. Please refresh and try again.")
    }

    // Auto-transition published->draft when editing (edge case #6)
    if (doc.status === "published") {
      await ctx.db.patch(args.id, { status: "draft" })
    }

    const now = Date.now()

    // Fix #7: Create history entry with the PREVIOUS content before overwriting.
    // This preserves the old content so restore/diff operations show what existed
    // before each edit, not what was just saved.
    if (doc.body) {
      await ctx.db.insert("documentHistory", {
        documentId: args.id,
        body: doc.body,
        frontmatter: doc.frontmatter,
        editedBy: userId,
        message: args.message || "Draft saved",
        createdAt: now,
      })
    }

    // Update the document with the new content. The contentVersion bump is
    // what makes the document dirty for publishing - workflow transitions
    // bump only updatedAt and leave cleanliness intact.
    await ctx.db.patch(args.id, {
      body: args.body,
      frontmatter: args.frontmatter,
      contentVersion: (doc.contentVersion ?? 0) + 1,
      updatedAt: now,
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
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    // Enforce state machine: only draft/approved can be published
    if (!isPublishableDocumentStatus(doc.status)) {
      throw new Error(`Cannot publish from "${doc.status}" status. Document must be in draft or approved state.`)
    }

    await resolveProjectAccess(
      ctx,
      {
        projectId: doc.projectId,
        userId: args.editedBy,
        projectAccessToken: args.projectAccessToken,
      },
      "editor",
    )

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
// "published" is NOT a valid target here - publishing requires a GitHub commit
// and must go through the `publish` mutation instead.
export const transitionStatus = mutation({
  args: {
    id: v.id("documents"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
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

    await resolveProjectAccess(
      ctx,
      {
        projectId: doc.projectId,
        userId: args.userId,
        projectAccessToken: args.projectAccessToken,
      },
      "editor",
    )

    const allowed = DOCUMENT_ALLOWED_TRANSITIONS[doc.status as keyof typeof DOCUMENT_ALLOWED_TRANSITIONS] || []
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
    if (!isPublishableDocumentStatus(doc.status)) {
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
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return []

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect()
    return docs.map((d) => ({
      filePath: d.filePath,
      pathRepresentation: d.pathRepresentation,
      title: d.title,
    }))
  },
})

/** Returns documents in draft/approved status that have body content not yet committed.
 * A document is considered dirty if it's in draft/approved status with body content. */
export const listDirtyForProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveProjectReader(ctx, args)
    if (!access) return []

    const drafts = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "draft"))
      .collect()
    const approved = await ctx.db
      .query("documents")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "approved"))
      .collect()
    return [...drafts, ...approved].filter(
      (d) => (d.body != null || d.frontmatter != null) && !isDocumentContentClean(d),
    )
  },
})

/**
 * Git-synchronization cleanliness. A document is clean while the CONTENT
 * recorded by its last reconciled publish is still current:
 * - Current provenance compares content versions, so workflow-only
 *   transitions (which bump updatedAt but not contentVersion) cannot make
 *   unchanged content dirty.
 * - Provenance recorded before contentVersion existed is a migration
 *   candidate and remains dirty until byte identity is proven against Git.
 * - Legacy timestamp-only rows are also migration candidates, never clean.
 * Recording provenance never bumps updatedAt or contentVersion, so every
 * comparison is stable across reconciliation replays; closing the lane
 * unmerged clears the provenance and the document becomes dirty again.
 */
/**
 * Record Git-synchronization provenance after a publish reconciled this
 * document: which base/lane branch and commit hold the published snapshot, the
 * content-specific revision that landed, and the snapshot's updatedAt.
 *
 * Deliberately IDEMPOTENT: it records what landed without ever touching
 * updatedAt, and cleanliness is derived from the content-version match.
 * Replaying the same authority/commit/revision association - recovery after a
 * partial reconcile, or a retry between the SHA refresh and markReconciled -
 * patches identical values, so it can neither flip a synchronized document
 * dirty nor mask a concurrent edit as clean.
 */
export const markPublishedSnapshot = mutation({
  args: {
    id: v.id("documents"),
    githubSha: v.string(),
    authorityKind: v.union(v.literal("base"), v.literal("lane")),
    authorityBranch: v.string(),
    publishBranchId: v.optional(v.id("publishBranches")),
    publishAttemptId: v.optional(v.id("publishAttempts")),
    commitSha: v.string(),
    repoPath: v.optional(v.string()),
    // Optional only for replays of attempts recorded before the fields
    // existed; every new publish provides both.
    contentRevision: v.optional(v.string()),
    publishedContentVersion: v.optional(v.number()),
    expectedUpdatedAt: v.number(),
    serverQueryToken: v.optional(v.string()),
    userId: v.optional(v.string()),
    projectAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    const { project } = await resolveProjectAccess(
      ctx,
      { projectId: doc.projectId, userId: args.userId, projectAccessToken: args.projectAccessToken },
      "editor",
    )
    assertGitHubCommitSha(args.githubSha, "GitHub blob SHA")
    assertGitHubCommitSha(args.commitSha, "GitHub commit SHA")
    if (args.contentRevision !== undefined && !/^[0-9a-f]{64}$/i.test(args.contentRevision)) {
      throw new Error("Invalid publish content revision")
    }
    if (
      args.publishedContentVersion !== undefined &&
      (!Number.isInteger(args.publishedContentVersion) || args.publishedContentVersion < 0)
    ) {
      throw new Error("Invalid published content version")
    }
    if (!args.authorityBranch) throw new Error("Publish provenance requires an authority branch")
    if (args.authorityKind === "base" && (args.publishBranchId !== undefined || args.publishAttemptId !== undefined)) {
      throw new Error("Base provenance cannot reference a publish lane or attempt")
    }
    if (args.authorityKind === "lane" && args.publishBranchId === undefined) {
      throw new Error("Lane provenance requires a publish branch")
    }
    if (args.publishAttemptId !== undefined && args.authorityKind !== "lane") {
      throw new Error("Publish attempt provenance requires lane authority")
    }
    if (args.publishAttemptId === undefined && !(await verifyServerQueryToken(args.serverQueryToken))) {
      throw new Error("Unauthorized: no-attempt provenance requires server proof")
    }
    let publishLane: { branchName: string } | null = null
    if (args.authorityKind === "base") {
      if (args.authorityBranch !== project.branch) {
        throw new Error("Publish base authority must match the project's configured branch")
      }
    } else {
      const lane = await ctx.db.get(args.publishBranchId!)
      if (
        !lane ||
        !("branchName" in lane) ||
        lane.projectId !== doc.projectId ||
        lane.branchName !== args.authorityBranch ||
        lane.status !== "active"
      ) {
        throw new Error("Publish lane authority does not match an active lane for this project")
      }
      publishLane = lane
    }
    if (args.publishAttemptId !== undefined) {
      const publishAttempt = await requireCommittedAttempt(ctx.db, {
        attemptId: args.publishAttemptId,
        projectId: doc.projectId,
        publishBranchId: args.publishBranchId,
        commitSha: args.commitSha,
      })
      if (publishAttempt.branchName !== publishLane?.branchName) {
        throw new Error("Publish attempt ownership mismatch: attempt branch differs from lane authority")
      }
      requireDocumentAssociation(publishAttempt, {
        documentId: args.id,
        repoPath: args.repoPath,
        expectedUpdatedAt: args.expectedUpdatedAt,
        contentRevision: args.contentRevision,
        contentVersion: args.publishedContentVersion,
      })
    }
    const publishedProvenance: {
      authorityKind: "base" | "lane"
      authorityBranch: string
      publishBranchId?: typeof args.publishBranchId
      publishAttemptId?: typeof args.publishAttemptId
      commitSha: string
      previousGitBaselineState?: "unknown" | "absent" | "blob"
      previousGithubSha?: string
      publishedUpdatedAt: number
      contentRevision?: string
      publishedContentVersion?: number
    } = {
      authorityKind: args.authorityKind,
      authorityBranch: args.authorityBranch,
      commitSha: args.commitSha,
      publishedUpdatedAt: args.expectedUpdatedAt,
    }
    if (args.publishBranchId !== undefined) publishedProvenance.publishBranchId = args.publishBranchId
    if (args.authorityKind === "lane") {
      const existingProvenance = doc.publishedProvenance
      const replayingSameLaneAuthority =
        existingProvenance?.authorityKind === "lane" &&
        existingProvenance.authorityBranch === args.authorityBranch &&
        existingProvenance.publishBranchId === args.publishBranchId &&
        existingProvenance.publishAttemptId === args.publishAttemptId &&
        existingProvenance.commitSha === args.commitSha &&
        existingProvenance.contentRevision === args.contentRevision
      if (replayingSameLaneAuthority) {
        if (existingProvenance.previousGitBaselineState !== undefined) {
          publishedProvenance.previousGitBaselineState = existingProvenance.previousGitBaselineState
        }
        if (existingProvenance.previousGithubSha !== undefined) {
          publishedProvenance.previousGithubSha = existingProvenance.previousGithubSha
        }
      } else {
        const previousGitBaselineState = doc.gitBaselineState ?? (doc.githubSha ? "blob" : "unknown")
        publishedProvenance.previousGitBaselineState = previousGitBaselineState
        if (previousGitBaselineState === "blob" && doc.githubSha) {
          publishedProvenance.previousGithubSha = doc.githubSha
        }
      }
    }
    if (args.publishAttemptId !== undefined) {
      publishedProvenance.publishAttemptId = args.publishAttemptId
    }
    if (args.contentRevision !== undefined) {
      publishedProvenance.contentRevision = args.contentRevision
    }
    if (args.publishedContentVersion !== undefined) {
      publishedProvenance.publishedContentVersion = args.publishedContentVersion
    }
    await ctx.db.patch(args.id, {
      githubSha: args.githubSha,
      gitBaselineState: "blob",
      publishedProvenance,
      // Lazy migration: the legacy cleanliness marker is superseded the
      // first time real provenance lands.
      lastPublishedUpdatedAt: undefined,
    })
    // synchronized: the planned snapshot is still the document's current
    // content, so it is now clean. A concurrent content edit leaves it
    // dirty - the provenance still truthfully records what landed.
    const synchronized =
      args.publishedContentVersion !== undefined
        ? args.publishedContentVersion === (doc.contentVersion ?? 0)
        : doc.updatedAt === args.expectedUpdatedAt
    return { synchronized }
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
    readRef: v.string(),
    files: v.array(v.object({ path: v.string(), sha: v.string() })),
    githubToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { actorUserId, project } = await authorizeGitHubProjectActor(ctx, args)
    if (!Array.isArray(args.files) || args.files.length > TITLE_SYNC_MAX_FILES) {
      throw new Error(`file list exceeds ${TITLE_SYNC_MAX_FILES} entries`)
    }
    for (let index = 0; index < args.files.length; index++) {
      if (!Object.hasOwn(args.files, index)) throw new Error("Invalid file list")
    }
    const seenPaths = new Set<string>()
    let totalPathBytes = 0
    const files = args.files.map((file) => {
      assertGitHubCommitSha(file.sha, "file sha")
      const pathBytes = utf8Encoder.encode(file.path).byteLength
      if (pathBytes > TITLE_SYNC_MAX_PATH_BYTES) {
        throw new Error(`content path exceeds ${TITLE_SYNC_MAX_PATH_BYTES} bytes`)
      }
      totalPathBytes += pathBytes
      if (totalPathBytes > TITLE_SYNC_MAX_TOTAL_PATH_BYTES) {
        throw new Error(`total path bytes exceed ${TITLE_SYNC_MAX_TOTAL_PATH_BYTES}`)
      }
      const path = assertContentPath(file.path)
      if (seenPaths.has(path)) throw new Error("Duplicate content path")
      seenPaths.add(path)
      const repoPath = toRepoPath(project.contentRoot, path)
      if (!/\.(?:md|mdx|markdown)$/i.test(repoPath)) throw new Error("Unsupported content file")
      return { path, sha: file.sha, repoPath }
    })

    await ctx.runMutation(internal.projects.consumeGitHubActionRateLimit, {
      projectId: args.projectId,
      userId: actorUserId,
      action: "title_sync",
    })
    await verifyGitHubProjectReadAccess(project, args.githubToken, args.readRef)

    // Check which files already have document records
    const existingDocs = await ctx.runQuery(internal.documents.listByProjectInternal, {
      projectId: args.projectId,
    })
    const existingPaths = new Set(
      existingDocs.map((document) =>
        resolveStoredContentPath(
          project.contentRoot,
          document.filePath,
          document.pathRepresentation as StoredPathRepresentation | undefined,
        ),
      ),
    )

    const missingFiles = files.filter((f) => !existingPaths.has(f.path))
    if (missingFiles.length === 0) return

    // Fetch and validate every missing file before opening the single write transaction.
    const BATCH_SIZE = 5
    const normalizedDocuments: NormalizedTitleSyncDocument[] = []
    for (let i = 0; i < missingFiles.length; i += BATCH_SIZE) {
      const batch = missingFiles.slice(i, i + BATCH_SIZE)
      const normalizedBatch = await Promise.all(
        batch.map(async (file) => {
          let response: Response
          try {
            response = await fetch(
              `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/contents/${encodeURIComponent(file.repoPath)}?ref=${encodeURIComponent(args.readRef)}`,
              {
                headers: {
                  Authorization: `token ${args.githubToken}`,
                  Accept: "application/vnd.github+json",
                },
              },
            )
          } catch {
            throw new Error("Failed to fetch title content")
          }
          if (!response.ok) throw new Error("Failed to fetch title content")

          let payload: {
            type?: string
            sha?: string
            size?: number
            encoding?: string
            content?: string
          }
          try {
            payload = (await response.json()) as typeof payload
          } catch {
            throw new Error("Invalid title content")
          }
          if (payload.sha !== file.sha) throw new Error("File SHA mismatch")

          const content = decodeTitleSyncContent(payload)
          if (content === null) throw new Error("Invalid title content")

          return Object.freeze({
            filePath: file.path,
            title: titleFromContent(file.path, content),
            githubSha: file.sha,
          })
        }),
      )
      normalizedDocuments.push(...normalizedBatch)
    }

    const documents = Object.freeze(normalizedDocuments)
    validateTitleSyncBatch(documents)
    await ctx.runMutation(internal.documents.getOrCreateTitleSyncBatchInternal, {
      projectId: args.projectId,
      documents: documents as NormalizedTitleSyncDocument[],
    })
  },
})
