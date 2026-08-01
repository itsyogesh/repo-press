import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs"
import { ConvexHttpClient } from "convex/browser"
import { cookies } from "next/headers"
import { api } from "@/convex/_generated/api"
import { createGitHubClient } from "@/lib/github"
import { mintGitHubIdentityBootstrapToken } from "@/lib/project-access-token"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL

// Only initialize when both env vars are available
const authHelpers = convexUrl && convexSiteUrl ? convexBetterAuthNextJs({ convexUrl, convexSiteUrl }) : null
const convexServerClient = convexUrl ? new ConvexHttpClient(convexUrl) : null

export const handler = authHelpers?.handler
export const preloadAuthQuery = authHelpers?.preloadAuthQuery
export const isAuthenticated = authHelpers?.isAuthenticated
export const getToken = authHelpers?.getToken
export const fetchAuthQuery = authHelpers?.fetchAuthQuery
export const fetchAuthMutation = authHelpers?.fetchAuthMutation
export const fetchAuthAction = authHelpers?.fetchAuthAction

/**
 * Get GitHub access token from PAT cookie or Convex accounts table (OAuth users).
 */
export async function getGitHubToken(): Promise<string | null> {
  // Check PAT cookie first (simple flow)
  const cookieStore = await cookies()
  const pat = cookieStore.get("github_pat")?.value
  if (pat) {
    return pat
  }

  // For OAuth users, fetch the token from Convex
  if (fetchAuthQuery) {
    try {
      const { api } = await import("../convex/_generated/api")
      const token = await fetchAuthQuery(api.auth.getGitHubAccessToken)
      return token ?? null
    } catch {
      // Not authenticated or query failed
      return null
    }
  }

  return null
}

export async function getPatAuthUserId(token: string): Promise<string | null> {
  if (!convexServerClient) return null

  try {
    const octokit = createGitHubClient(token)
    const { data } = await octokit.users.getAuthenticated()
    const bootstrapToken = await mintGitHubIdentityBootstrapToken({
      githubAccountId: String(data.id),
      githubUsername: data.login,
      name: data.name?.trim() || null,
      image: data.avatar_url || null,
    })
    const userId = await convexServerClient.mutation(api.auth.resolveOrCreatePatUser, { bootstrapToken })
    return userId ?? null
  } catch {
    return null
  }
}
