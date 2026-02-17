import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs"
import { cookies } from "next/headers"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL

// Only initialize when both env vars are available
const authHelpers = convexUrl && convexSiteUrl ? convexBetterAuthNextJs({ convexUrl, convexSiteUrl }) : null

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
