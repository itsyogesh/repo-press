import { v } from "convex/values"
import { verifyProjectAccessToken } from "../lib/project-access-token"
import { internalMutation, internalQuery, mutation } from "./_generated/server"

const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

const roleValidator = v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer"))

type Role = "owner" | "editor" | "viewer"

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
}

/**
 * Public upsert for repo access cache. Called from route handlers and
 * server components via ConvexHttpClient (which cannot call internal mutations).
 *
 * Requires a valid projectAccessToken (HMAC-signed) to prevent unauthorized
 * users from granting themselves elevated roles on arbitrary repos.
 */
export const upsert = mutation({
  args: {
    repoOwner: v.string(),
    repoName: v.string(),
    userId: v.string(),
    githubUsername: v.string(),
    role: roleValidator,
    projectAccessToken: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify the HMAC-signed token
    const payload = await verifyProjectAccessToken(args.projectAccessToken)
    if (!payload) {
      throw new Error("Unauthorized: invalid cache write token")
    }

    // Verify identity: token userId must match the userId being cached
    if (payload.userId !== args.userId) {
      throw new Error("Unauthorized: invalid cache write token")
    }

    // Verify repo: token repo must match the repo being cached
    if (payload.repoOwner !== args.repoOwner || payload.repoName !== args.repoName) {
      throw new Error("Unauthorized: invalid cache write token")
    }

    // Enforce role ceiling: cached role must not exceed the token's role
    const tokenRoleLevel = ROLE_HIERARCHY[payload.role as Role] ?? 0
    const requestedRoleLevel = ROLE_HIERARCHY[args.role]
    if (requestedRoleLevel > tokenRoleLevel) {
      throw new Error("Unauthorized: invalid cache write token")
    }

    const now = Date.now()
    const existing = await ctx.db
      .query("repoAccessCache")
      .withIndex("by_repo_userId", (q) =>
        q.eq("repoOwner", args.repoOwner).eq("repoName", args.repoName).eq("userId", args.userId),
      )
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        githubUsername: args.githubUsername,
        role: args.role,
        checkedAt: now,
        expiresAt: now + CACHE_TTL_MS,
      })
      return existing._id
    }

    // Destructure to exclude projectAccessToken from the DB row
    const { projectAccessToken: _token, ...cacheFields } = args
    return await ctx.db.insert("repoAccessCache", {
      ...cacheFields,
      checkedAt: now,
      expiresAt: now + CACHE_TTL_MS,
    })
  },
})

/** Read a cache entry for a specific user + repo. */
export const getForUser = internalQuery({
  args: {
    repoOwner: v.string(),
    repoName: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repoAccessCache")
      .withIndex("by_repo_userId", (q) =>
        q.eq("repoOwner", args.repoOwner).eq("repoName", args.repoName).eq("userId", args.userId),
      )
      .first()
  },
})

/** Delete all expired cache entries. Intended for cron cleanup. */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const expired = await ctx.db
      .query("repoAccessCache")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(200)

    for (const entry of expired) {
      await ctx.db.delete(entry._id)
    }

    return expired.length
  },
})
