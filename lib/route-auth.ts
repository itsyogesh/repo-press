import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { getGitHubToken } from "@/lib/auth-server"
import { getRepoRole, probeRepoReadAccess } from "@/lib/github-permissions"

export { getContentType } from "@/lib/media/content-type"

import { resolveProjectAccessRole } from "@/lib/project-access-role"
import { mintProjectAccessToken } from "@/lib/project-access-token"
import type { Role } from "@/lib/roles"
import { roleAtLeast } from "@/lib/roles"
import { createServerQueryContext, resolveActingUserId } from "@/lib/server-context"

interface RouteAuthResult {
  actingUserId: string
  role: Role
  projectAccessToken: string
  githubToken: string
}

/**
 * Shared auth resolution for route handlers.
 * Replaces 3 copies of resolveActingUserId + verifyProjectAccess + token minting.
 *
 * Steps:
 * 1. Resolve the calling user (OAuth session or PAT)
 * 2. Check GitHub permissions on the repo
 * 3. Cache permissions in Convex
 * 4. Mint a projectAccessToken with role
 */
export async function resolveRouteAuth(
  project: Doc<"projects">,
  minimumRole: Role = "editor",
): Promise<RouteAuthResult> {
  const githubToken = await getGitHubToken()
  if (!githubToken) {
    throw new RouteAuthError("Unauthorized", 401)
  }

  // 1. Resolve acting user
  const actingUserId = await resolveActingUserId(githubToken)

  if (!actingUserId) {
    throw new RouteAuthError("Unauthorized", 401)
  }

  // 2. Check GitHub permissions, fall back to project ownership, then cache
  const { role: githubRole } = await getRepoRole(githubToken, project.repoOwner, project.repoName)
  let role: Role | null = resolveProjectAccessRole({
    actingUserId,
    projectOwnerId: project.userId,
    resolvedRepoRole: githubRole,
  })

  // Fallback chain when getRepoRole returns null (e.g. OAuth app lacks org access)
  if (!role) {
    // 1. Check the access cache (seeded by prior studio page visits)
    try {
      const { convex, serverQueryToken } = await createServerQueryContext()
      const cached = await convex.query(api.repoAccessCache.getForUserPublic, {
        repoOwner: project.repoOwner,
        repoName: project.repoName,
        userId: actingUserId,
        serverQueryToken,
      })
      if (cached) {
        role = cached.role as Role
      }
    } catch {
      // Cache lookup failed
    }
    // 2. Probe: can the token actually read repo content?
    if (!role) {
      role = await probeRepoReadAccess(githubToken, project.repoOwner, project.repoName)
    }
  }

  if (!role) {
    throw new RouteAuthError("Forbidden: no access to repository", 403)
  }

  // 3. Check minimum role
  if (!roleAtLeast(role, minimumRole)) {
    throw new RouteAuthError(`Forbidden: requires "${minimumRole}" permission, have "${role}"`, 403)
  }

  // 4. Mint project access token first (needed to authorize cache write)
  const projectAccessToken = await mintProjectAccessToken({
    projectId: project._id,
    userId: actingUserId,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    branch: project.branch,
    role,
  })

  // 5. Cache in Convex (best-effort, don't fail the request)
  try {
    const { convex } = await createServerQueryContext()
    // Get the GitHub username for the cache
    const { createGitHubClient } = await import("@/lib/github")
    const octokit = createGitHubClient(githubToken)
    const { data: ghUser } = await octokit.users.getAuthenticated()

    await convex.mutation(api.repoAccessCache.upsert, {
      repoOwner: project.repoOwner,
      repoName: project.repoName,
      userId: actingUserId,
      githubUsername: ghUser.login,
      role,
      projectAccessToken,
    })
  } catch {
    // Non-critical: cache miss just means next action will re-check
  }

  return { actingUserId, role, projectAccessToken, githubToken }
}

export class RouteAuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
