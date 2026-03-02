import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  // ─── Better Auth tables ────────────────────────────────────
  users: defineTable({
    name: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
    image: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    // GitHub-specific fields
    githubId: v.optional(v.string()),
    githubUsername: v.optional(v.string()),
    githubAccessToken: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_githubId", ["githubId"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_token", ["token"]),

  accounts: defineTable({
    userId: v.id("users"),
    accountId: v.string(),
    providerId: v.string(),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    refreshTokenExpiresAt: v.optional(v.number()),
    scope: v.optional(v.string()),
    idToken: v.optional(v.string()),
    password: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_providerId_accountId", ["providerId", "accountId"]),

  verifications: defineTable({
    identifier: v.string(),
    value: v.string(),
    expiresAt: v.number(),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_identifier", ["identifier"]),

  // ─── Core Project Layer ────────────────────────────────────
  projects: defineTable({
    userId: v.string(), // Auth component user ID (not app's "users" table)
    name: v.string(),
    description: v.optional(v.string()),
    repoOwner: v.string(),
    repoName: v.string(),
    branch: v.string(),
    contentRoot: v.string(), // e.g. "" for root, "apps/docs/content/docs", "content/blog"
    detectedFramework: v.optional(v.string()),
    contentType: v.union(
      v.literal("blog"),
      v.literal("docs"),
      v.literal("pages"),
      v.literal("changelog"),
      v.literal("custom"),
    ),
    // Framework-specific frontmatter field config
    frontmatterSchema: v.optional(v.any()), // JSON: field definitions for the editor

    // Config properties (RepoPress Multi-Project MDX Runtime)
    configProjectId: v.optional(v.string()),
    configVersion: v.optional(v.number()),
    configPath: v.optional(v.string()), // default: repopress.config.json
    previewEntry: v.optional(v.string()),
    enabledPlugins: v.optional(v.array(v.string())),
    pluginRegistry: v.optional(v.any()), // Map of pluginId -> manifestPath
    components: v.optional(v.any()), // Map of componentName -> { props, hasChildren, kind }
    frameworkSource: v.optional(v.union(v.literal("config"), v.literal("detected"))),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_repo", ["repoOwner", "repoName"])
    .index("by_userId_repo", ["userId", "repoOwner", "repoName"]),

  // ─── Content Collections (custom content types per project) ─
  collections: defineTable({
    projectId: v.id("projects"),
    name: v.string(), // e.g. "Blog Posts", "Changelogs", "API Docs"
    slug: v.string(),
    description: v.optional(v.string()),
    folderPath: v.string(), // relative to project contentRoot
    // Schema definition for this collection's frontmatter
    fieldSchema: v.optional(v.any()), // JSON array of field definitions
    icon: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_slug", ["projectId", "slug"]),

  // ─── Authors ───────────────────────────────────────────────
  authors: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    email: v.optional(v.string()),
    avatar: v.optional(v.string()),
    bio: v.optional(v.string()),
    url: v.optional(v.string()),
    githubUsername: v.optional(v.string()),
    twitterHandle: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_slug", ["projectId", "slug"]),

  // ─── Tags ──────────────────────────────────────────────────
  tags: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    color: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_slug", ["projectId", "slug"]),

  // ─── Categories (supports nesting) ─────────────────────────
  categories: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    parentId: v.optional(v.id("categories")),
    description: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_slug", ["projectId", "slug"])
    .index("by_parentId", ["parentId"]),

  // ─── Documents (tracked MDX/MD files) ──────────────────────
  documents: defineTable({
    projectId: v.id("projects"),
    collectionId: v.optional(v.id("collections")),
    filePath: v.string(), // relative to project contentRoot
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
    // Content
    body: v.optional(v.string()), // MDX content (draft body stored here)
    frontmatter: v.optional(v.any()), // Full frontmatter as JSON
    coverImage: v.optional(v.string()),
    // Relationships
    authorIds: v.optional(v.array(v.id("authors"))),
    tagIds: v.optional(v.array(v.id("tags"))),
    categoryIds: v.optional(v.array(v.id("categories"))),
    // Review/Workflow
    reviewerId: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
    // Ordering (Fumadocs/Docusaurus sidebar)
    order: v.optional(v.number()),
    // GitHub sync state
    githubSha: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    // Scheduling
    publishedAt: v.optional(v.number()),
    scheduledAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_status", ["projectId", "status"])
    .index("by_projectId_filePath", ["projectId", "filePath"])
    .index("by_collectionId", ["collectionId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["projectId"],
    }),

  // ─── Document History (version snapshots) ──────────────────
  documentHistory: defineTable({
    documentId: v.id("documents"),
    body: v.string(),
    frontmatter: v.optional(v.any()),
    editedBy: v.string(),
    commitSha: v.optional(v.string()),
    message: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_documentId", ["documentId"])
    .index("by_documentId_createdAt", ["documentId", "createdAt"]),

  // ─── Folder Meta (meta.json / _meta.json equivalents) ──────
  folderMeta: defineTable({
    projectId: v.id("projects"),
    folderPath: v.string(), // relative to contentRoot
    title: v.optional(v.string()),
    icon: v.optional(v.string()),
    defaultOpen: v.optional(v.boolean()),
    root: v.optional(v.boolean()), // Fumadocs root marker
    pageOrder: v.optional(v.array(v.string())), // ordered filenames
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_folderPath", ["projectId", "folderPath"]),

  // ─── Media Assets ──────────────────────────────────────────
  mediaAssets: defineTable({
    projectId: v.id("projects"),
    fileName: v.string(),
    filePath: v.string(), // path in GitHub repo
    mimeType: v.optional(v.string()),
    altText: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    sizeBytes: v.optional(v.number()),
    githubSha: v.optional(v.string()),
    // Which documents reference this asset
    usedInDocumentIds: v.optional(v.array(v.id("documents"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_filePath", ["projectId", "filePath"]),

  // ─── Webhooks ──────────────────────────────────────────────
  webhooks: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    url: v.string(),
    secret: v.optional(v.string()),
    events: v.array(
      v.union(
        v.literal("document.published"),
        v.literal("document.updated"),
        v.literal("document.deleted"),
        v.literal("document.status_changed"),
        v.literal("project.updated"),
      ),
    ),
    isActive: v.boolean(),
    lastTriggeredAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_isActive", ["projectId", "isActive"]),

  // ─── Explorer Ops (staged file create/delete for PR-based publish) ─
  explorerOps: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    opType: v.union(v.literal("create"), v.literal("delete")),
    filePath: v.string(),
    initialBody: v.optional(v.string()),
    initialFrontmatter: v.optional(v.any()),
    previousSha: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("committed"), v.literal("undone")),
    commitSha: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_status", ["projectId", "status"])
    .index("by_projectId_filePath", ["projectId", "filePath"]),

  // ─── Publish Branches (PR-based publish workflow) ─────────────────
  publishBranches: defineTable({
    projectId: v.id("projects"),
    branchName: v.string(),
    baseBranch: v.string(),
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("merged"), v.literal("closed")),
    lastCommitSha: v.optional(v.string()),
    committedFilePaths: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_status", ["projectId", "status"])
    .index("by_prNumber", ["prNumber"]),
})
