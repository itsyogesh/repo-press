import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { getRepoRole } from "@/lib/github-permissions"
import { mintProjectAccessToken } from "@/lib/project-access-token"

type Role = "owner" | "editor" | "viewer"

interface RouteAuthResult {
  actingUserId: string
  role: Role
  projectAccessToken: string
  githubToken: string
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

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
  const oauthUserId = await resolveActingUserId()
  const patUserId = !oauthUserId ? await getPatAuthUserId(githubToken) : null
  const actingUserId = oauthUserId ?? patUserId

  if (!actingUserId) {
    throw new RouteAuthError("Unauthorized", 401)
  }

  // 2. Check GitHub permissions
  const role = await getRepoRole(githubToken, project.repoOwner, project.repoName)
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

async function resolveActingUserId(): Promise<string | null> {
  if (fetchAuthQuery) {
    try {
      const authUser = await fetchAuthQuery(api.auth.getCurrentUser)
      if (authUser?._id) {
        return authUser._id as string
      }
    } catch {
      // Not an OAuth session
    }
  }
  return null
}

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
}

function roleAtLeast(actual: Role, minimum: Role): boolean {
  return ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[minimum]
}

export class RouteAuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Shared content type resolver (duplicated in upload and resolve routes). */
export function getContentType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop()
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    webm: "video/webm",
    mp4: "video/mp4",
    pdf: "application/pdf",
  }
  return types[ext || ""] || "application/octet-stream"
}
