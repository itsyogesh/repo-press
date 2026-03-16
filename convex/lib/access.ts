import { verifyProjectAccessToken } from "../../lib/project-access-token"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { authComponent } from "../auth"

export type Role = "owner" | "editor" | "viewer"

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
}

export function roleAtLeast(actual: Role, minimum: Role): boolean {
  return ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[minimum]
}

export function requireRole(actual: Role, minimum: Role): void {
  if (!roleAtLeast(actual, minimum)) {
    throw new Error(`Insufficient permissions: requires "${minimum}", have "${actual}"`)
  }
}

interface AccessResult {
  userId: string
  role: Role
  project: Doc<"projects">
}

/**
 * Resolve and authorize the caller for a project-level mutation.
 *
 * Authorization sources (checked in order):
 * 1. OAuth session via Better Auth → get authUserId
 * 2. projectAccessToken (signed, includes role) → get payload.userId + payload.role
 * 3. Neither → throw "Unauthorized"
 *
 * Role resolution:
 * - If the token carries a role, that role is trusted directly (avoids cache TTL stranding).
 * - For OAuth session users: check repoAccessCache, fall back to project.userId ownership.
 * - Compares resolved role against minimumRole.
 */
export async function resolveProjectAccess(
  ctx: MutationCtx,
  args: {
    projectId: string | Id<"projects">
    userId?: string
    projectAccessToken?: string
  },
  minimumRole: Role = "editor",
): Promise<AccessResult> {
  const project = await ctx.db.get(args.projectId as Id<"projects">)
  if (!project) {
    throw new Error("Project not found")
  }

  // 1. Check OAuth session
  const authUser = await authComponent.safeGetAuthUser(ctx)
  if (authUser?._id) {
    const authUserId = authUser._id as string
    if (args.userId && args.userId !== authUserId) {
      throw new Error("Unauthorized: caller identity does not match userId")
    }

    try {
      const role = await resolveRole(ctx, project, authUserId)
      requireRole(role, minimumRole)
      return { userId: authUserId, role, project }
    } catch {
      // Cache expired or not owner — fall through to projectAccessToken
    }
  }

  // 2. Verify projectAccessToken (also serves as fallback when OAuth cache expires)
  const payload = await verifyProjectAccessToken(args.projectAccessToken)
  if (payload && payload.projectId === (args.projectId as string)) {
    if (args.userId && args.userId !== payload.userId) {
      throw new Error("Unauthorized: caller identity does not match userId")
    }

    // Trust the role from the token directly (avoids cache TTL stranding - P1 fix)
    const role: Role = (payload.role as Role) ?? "owner"
    requireRole(role, minimumRole)
    return { userId: payload.userId, role, project }
  }

  throw new Error("Unauthorized: Not authenticated")
}

/**
 * Resolve and authorize the caller for a project-level query.
 * Similar to resolveProjectAccess but works with QueryCtx.
 *
 * For queries, we accept:
 * 1. OAuth session → check ownership or cache
 * 2. projectAccessToken → trust token role
 *
 * Returns null instead of throwing when unauthenticated, so queries can
 * gracefully return empty results for unauthenticated users.
 */
export async function resolveProjectReader(
  ctx: QueryCtx,
  args: {
    projectId: string | Id<"projects">
    userId?: string
    projectAccessToken?: string
  },
): Promise<AccessResult | null> {
  const project = await ctx.db.get(args.projectId as Id<"projects">)
  if (!project) return null

  // 1. Check OAuth session
  const authUser = await authComponent.safeGetAuthUser(ctx)
  if (authUser?._id) {
    const authUserId = authUser._id as string

    // Owner check
    if (project.userId === authUserId) {
      return { userId: authUserId, role: "owner", project }
    }

    // Check repoAccessCache
    const cached = await ctx.db
      .query("repoAccessCache")
      .withIndex("by_repo_userId", (q) =>
        q.eq("repoOwner", project.repoOwner).eq("repoName", project.repoName).eq("userId", authUserId),
      )
      .first()

    if (cached && cached.expiresAt > Date.now()) {
      return { userId: authUserId, role: cached.role, project }
    }

    // No cache, not owner → no access
    return null
  }

  // 2. Verify projectAccessToken
  const payload = await verifyProjectAccessToken(args.projectAccessToken)
  if (payload && payload.projectId === (args.projectId as string)) {
    const role: Role = (payload.role as Role) ?? "owner"
    return { userId: payload.userId, role, project }
  }

  return null
}

/**
 * Resolve the role for an OAuth-authenticated user on a project.
 * Checks project ownership first, then repoAccessCache.
 */
async function resolveRole(ctx: MutationCtx, project: Doc<"projects">, userId: string): Promise<Role> {
  // Direct owner check (backward compat)
  if (project.userId === userId) {
    return "owner"
  }

  // Check repoAccessCache
  const cached = await ctx.db
    .query("repoAccessCache")
    .withIndex("by_repo_userId", (q) =>
      q.eq("repoOwner", project.repoOwner).eq("repoName", project.repoName).eq("userId", userId),
    )
    .first()

  if (cached && cached.expiresAt > Date.now()) {
    return cached.role
  }

  // No cache hit and not owner → unauthorized
  throw new Error("Unauthorized")
}
