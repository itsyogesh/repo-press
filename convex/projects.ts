import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { authComponent } from "./auth"

/**
 * Verify that the caller is the user they claim to be.
 * - OAuth users: checks auth identity from session token
 * - PAT users (no auth session): falls back to verifying the user exists
 */
async function verifyCallerIdentity(ctx: MutationCtx, claimedUserId: Id<"users">) {
  const authUser = await authComponent.getAuthUser(ctx)
  if (authUser) {
    if (authUser._id !== claimedUserId) {
      throw new Error("Unauthorized: caller identity does not match userId")
    }
    return
  }
  // No auth session (PAT user) — verify the user record exists
  const user = await ctx.db.get(claimedUserId)
  if (!user) throw new Error("Unauthorized: user not found")
}

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
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
    userId: v.id("users"),
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
      .withIndex("by_repo", (q) =>
        q.eq("repoOwner", args.repoOwner).eq("repoName", args.repoName),
      )

    if (args.branch) {
      return await q.filter((q) => q.eq(q.field("branch"), args.branch)).first()
    }
    return await q.first()
  },
})

const frameworkValidator = v.optional(
  v.union(
    v.literal("fumadocs"),
    v.literal("nextra"),
    v.literal("astro"),
    v.literal("hugo"),
    v.literal("docusaurus"),
    v.literal("jekyll"),
    v.literal("contentlayer"),
    v.literal("next-mdx"),
    v.literal("custom"),
  ),
)

const contentTypeValidator = v.union(
  v.literal("blog"),
  v.literal("docs"),
  v.literal("pages"),
  v.literal("changelog"),
  v.literal("custom"),
)

const projectArgs = {
  userId: v.id("users"),
  name: v.string(),
  description: v.optional(v.string()),
  repoOwner: v.string(),
  repoName: v.string(),
  branch: v.string(),
  contentRoot: v.string(),
  detectedFramework: frameworkValidator,
  contentType: contentTypeValidator,
  frontmatterSchema: v.optional(v.any()),
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
      .filter((q) =>
        q.and(
          q.eq(q.field("branch"), args.branch),
          q.eq(q.field("contentRoot"), args.contentRoot),
        ),
      )
      .first()

    if (existing) return existing._id

    const now = Date.now()
    return await ctx.db.insert("projects", {
      ...args,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    branch: v.optional(v.string()),
    contentRoot: v.optional(v.string()),
    detectedFramework: frameworkValidator,
    contentType: v.optional(contentTypeValidator),
    frontmatterSchema: v.optional(v.any()),
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
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
