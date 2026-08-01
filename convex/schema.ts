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
    createdBy: v.optional(v.string()), // Convex user ID of original creator (audit trail)
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

    // Orphan detection: set when a config-driven project is no longer in the config
    configRemoved: v.optional(v.boolean()),
    configRemovedAt: v.optional(v.number()),

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
    pathRepresentation: v.optional(v.union(v.literal("legacy_repo_v0"), v.literal("content_relative_v1"))),
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
    // Content-specific version counter: bumped ONLY when body/frontmatter
    // change (never by workflow/status transitions or provenance stamps).
    // Absent counts as 0. Publish cleanliness compares this against
    // publishedProvenance.publishedContentVersion.
    contentVersion: v.optional(v.number()),
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
    // LEGACY (lazily migrated): rows written before publishedProvenance
    // existed mark cleanliness as lastPublishedUpdatedAt === updatedAt.
    // Honored by listDirtyForProject until the next edit or publish, and
    // cleared whenever markPublishedSnapshot records new provenance.
    lastPublishedUpdatedAt: v.optional(v.number()),
    // Lane-synchronization provenance: which publish lane and commit hold
    // this document's published snapshot, the content-specific revision
    // (sha256 of the serialized bytes), the document's contentVersion at
    // planning time, and the planned updatedAt. The document is "clean"
    // for publishing while publishedContentVersion === contentVersion
    // (workflow-only transitions bump updatedAt but not contentVersion, so
    // they cannot dirty unchanged content); recording provenance never
    // bumps either field, so replays are no-ops. Closing the lane unmerged
    // clears the whole object and the document becomes dirty again.
    publishedProvenance: v.optional(
      v.object({
        publishBranchId: v.id("publishBranches"),
        publishAttemptId: v.optional(v.id("publishAttempts")),
        commitSha: v.string(),
        contentRevision: v.optional(v.string()),
        // Optional only for provenance recorded before the field existed;
        // those rows fall back to publishedUpdatedAt === updatedAt.
        publishedContentVersion: v.optional(v.number()),
        publishedUpdatedAt: v.number(),
      }),
    ),
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
    // Bounded closed-lane invalidation: fetch exactly the documents whose
    // clean state points at one lane, in batches.
    .index("by_publishedProvenance_publishBranchId", ["publishedProvenance.publishBranchId"])
    .index("by_publishedProvenance_lane_attempt", [
      "publishedProvenance.publishBranchId",
      "publishedProvenance.publishAttemptId",
    ])
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
    changeType: v.optional(v.union(v.literal("minor"), v.literal("major"), v.literal("patch"))),
    diffHash: v.optional(v.string()),
    githubCommitUrl: v.optional(v.string()),
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
    originalUrl: v.optional(v.string()),
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

  // ─── Repo Access Cache (collaborative access) ──────────────────
  repoAccessCache: defineTable({
    repoOwner: v.string(),
    repoName: v.string(),
    userId: v.string(), // Convex auth user ID
    githubUsername: v.string(),
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
    checkedAt: v.number(),
    expiresAt: v.number(), // TTL: 15 minutes from checkedAt
  })
    .index("by_repo_userId", ["repoOwner", "repoName", "userId"])
    .index("by_repo", ["repoOwner", "repoName"])
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  // ─── GitHub Action Rate Limits ──────────────────────────────
  githubActionRateLimits: defineTable({
    projectId: v.optional(v.id("projects")),
    scopeKey: v.string(),
    userId: v.string(),
    action: v.union(v.literal("title_sync"), v.literal("gallery_scan")),
    windowStartedAt: v.number(),
    attempts: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scope_user_action", ["scopeKey", "userId", "action"])
    .index("by_projectId", ["projectId"]),

  // ─── Deleted Config Projects (tombstone for config-driven project deletion) ─
  deletedConfigProjects: defineTable({
    configProjectId: v.string(), // The id field from repopress.config.json
    repoOwner: v.string(),
    repoName: v.string(),
    branch: v.string(),
    deletedBy: v.string(), // Convex auth user ID
    deletedAt: v.number(),
  })
    .index("by_repo", ["repoOwner", "repoName"])
    .index("by_repo_configProjectId", ["repoOwner", "repoName", "configProjectId"]),

  // ─── Explorer Ops (staged file create/delete for PR-based publish) ─
  explorerOps: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    opType: v.union(v.literal("create"), v.literal("delete")),
    filePath: v.string(),
    pathRepresentation: v.optional(v.union(v.literal("legacy_repo_v0"), v.literal("content_relative_v1"))),
    initialBody: v.optional(v.string()),
    initialFrontmatter: v.optional(v.any()),
    previousSha: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("committed"), v.literal("undone")),
    commitSha: v.optional(v.string()),
    publishBranchId: v.optional(v.id("publishBranches")),
    publishAttemptId: v.optional(v.id("publishAttempts")),
    // Canonical repository path captured when the operation is planned.
    // Newer pending intent checks use this directly instead of resolving a
    // mixture of legacy/content-relative paths during cleanup.
    repoPath: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_status", ["projectId", "status"])
    .index("by_projectId_filePath", ["projectId", "filePath"])
    .index("by_projectId_repoPath_status", ["projectId", "repoPath", "status"])
    // Bounded lane cleanup: fetch exactly one lane's committed ops in batches.
    .index("by_publishBranchId_status", ["publishBranchId", "status"])
    .index("by_publishBranchId_status_publishAttemptId", ["publishBranchId", "status", "publishAttemptId"]),

  // ─── Media Ops (staged media writes for PR-based publish) ──────────────
  mediaOps: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    repoPath: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.optional(v.number()),
    sourceFilePath: v.optional(v.string()),
    sourceType: v.union(v.literal("blob"), v.literal("githubBranch"), v.literal("convex")),
    blobUrl: v.optional(v.string()),
    blobAccess: v.optional(v.union(v.literal("public"), v.literal("private"))),
    githubBranch: v.optional(v.string()),
    githubPath: v.optional(v.string()),
    githubSha: v.optional(v.string()),
    convexStorageId: v.optional(v.string()),
    // "failed" rows are storage-deletion tombstones: they own a Convex
    // storage object whose delete failed, so the nightly cron can retry
    // until the object is gone (see mediaOps.stage / cleanupStaleUploads).
    status: v.union(v.literal("pending"), v.literal("committed"), v.literal("undone"), v.literal("failed")),
    commitSha: v.optional(v.string()),
    publishBranchId: v.optional(v.id("publishBranches")),
    publishAttemptId: v.optional(v.id("publishAttempts")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_status", ["projectId", "status"])
    .index("by_projectId_repoPath", ["projectId", "repoPath"])
    // Bounded lane cleanup: fetch exactly one lane's committed uploads in batches.
    .index("by_publishBranchId_status", ["publishBranchId", "status"])
    .index("by_publishBranchId_status_publishAttemptId", ["publishBranchId", "status", "publishAttemptId"]),

  // ─── Publish Branches (PR-based publish workflow) ─────────────────
  publishBranches: defineTable({
    projectId: v.id("projects"),
    branchName: v.string(),
    baseBranch: v.string(),
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("merged"), v.literal("closed")),
    // Immutable Git authority for a merged PR. The event/fallback path only
    // records this SHA; attempt-scoped reconciliation verifies exact trees
    // before any staged state is finalized.
    mergeCommitSha: v.optional(v.string()),
    mergeVerificationState: v.optional(v.union(v.literal("pending"), v.literal("complete"))),
    lastCommitSha: v.optional(v.string()),
    committedFilePaths: v.optional(v.array(v.string())),
    // Set when lane synchronization cleanup (closed-lane invalidation OR
    // merged-lane finalization, dispatched on status) is incomplete -
    // deferred behind an active publish attempt or split across bounded
    // batches. The nightly cron, the scheduled continuation, and attempt
    // recovery finish it durably.
    laneInvalidationPending: v.optional(v.boolean()),
    laneCleanupAction: v.optional(v.union(v.literal("restore_legacy"), v.literal("finalize_legacy"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_status", ["projectId", "status"])
    .index("by_prNumber", ["prNumber"])
    .index("by_projectId_mergeVerificationState", ["projectId", "mergeVerificationState"])
    .index("by_laneInvalidationPending", ["laneInvalidationPending"]),

  // ─── Publish Attempts (durable commit/reconcile boundary) ─────────
  // One row per publish request that reaches the commit boundary. Recovery
  // uses expectedHeadSha + planDigest (also embedded in the Git commit
  // message) to prove whether the commit landed, so a retry after a
  // post-commit failure reconciles instead of committing again.
  publishAttempts: defineTable({
    projectId: v.id("projects"),
    publishBranchId: v.id("publishBranches"),
    branchName: v.string(),
    expectedHeadSha: v.string(),
    planDigest: v.string(),
    operationDescriptors: v.optional(
      v.array(
        v.union(
          v.object({ path: v.string(), action: v.literal("delete") }),
          v.object({
            path: v.string(),
            action: v.union(v.literal("create"), v.literal("update")),
            expectedBlobSha: v.string(),
          }),
        ),
      ),
    ),
    // Compatibility projection for attempts created before exact descriptors.
    operationPaths: v.array(v.string()),
    opIds: v.array(v.id("explorerOps")),
    // Canonical, versioned ownership projection used by bounded cleanup.
    // Optional only for attempts written before attempt-scoped cleanup.
    explorerAssociations: v.optional(
      v.array(
        v.object({
          opId: v.id("explorerOps"),
          repoPath: v.string(),
          expectedUpdatedAt: v.number(),
        }),
      ),
    ),
    // Versioned media snapshot: identity + planned repoPath + planned
    // updatedAt, so an in-place replacement racing the publish is caught
    // transactionally at begin.
    mediaAssociations: v.array(
      v.object({
        mediaOpId: v.id("mediaOps"),
        repoPath: v.string(),
        expectedUpdatedAt: v.number(),
      }),
    ),
    documentAssociations: v.array(
      v.object({
        documentId: v.id("documents"),
        repoPath: v.string(),
        expectedUpdatedAt: v.number(),
        // sha256 of the exact serialized content this publish planned for
        // the document; stored into the document's publishedProvenance at
        // reconcile time. Optional only for attempts recorded before the
        // field existed.
        contentRevision: v.optional(v.string()),
        // The document's contentVersion at planning time - becomes the
        // provenance's publishedContentVersion. Optional only for attempts
        // recorded before the field existed.
        contentVersion: v.optional(v.number()),
      }),
    ),
    deleteAssociations: v.array(
      v.object({
        opId: v.id("explorerOps"),
        documentId: v.id("documents"),
        expectedUpdatedAt: v.number(),
      }),
    ),
    status: v.union(
      v.literal("committing"),
      v.literal("committed"),
      v.literal("reconciled"),
      v.literal("cleanup_pending"),
      v.literal("cleaned"),
      v.literal("superseded"),
    ),
    commitSha: v.optional(v.string()),
    cleanupId: v.optional(v.id("publishAttemptCleanups")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId_status", ["projectId", "status"])
    .index("by_publishBranchId_status", ["publishBranchId", "status"]),

  // ─── Publish Attempt Cleanups (durable bounded reconciliation) ───
  publishAttemptCleanups: defineTable({
    projectId: v.id("projects"),
    laneId: v.id("publishBranches"),
    attemptId: v.id("publishAttempts"),
    pathOutcomes: v.array(
      v.object({
        path: v.string(),
        disposition: v.union(v.literal("finalize"), v.literal("restore"), v.literal("discard")),
        finalBlobSha: v.optional(v.string()),
      }),
    ),
    authoritySha: v.optional(v.string()),
    phase: v.union(v.literal("explorer"), v.literal("media"), v.literal("documents"), v.literal("complete")),
    cursor: v.number(),
    status: v.union(v.literal("pending"), v.literal("complete")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_attemptId", ["attemptId"])
    .index("by_laneId_status", ["laneId", "status"])
    .index("by_status", ["status"]),

  // A merged lane may contain several publish attempts that touch the same
  // path. The first (newest) attempt whose descriptor matches the immutable
  // merge tree owns that path; older attempts persist a discard outcome.
  publishLanePathResolutions: defineTable({
    projectId: v.id("projects"),
    laneId: v.id("publishBranches"),
    authoritySha: v.string(),
    repoPath: v.string(),
    claimedAttemptId: v.id("publishAttempts"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_lane_authority_path", ["laneId", "authoritySha", "repoPath"]),
})
