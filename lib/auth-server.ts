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
 * Get GitHub access token from PAT cookie.
 * OAuth access tokens are stored in Convex accounts table
 * and can be fetched via a Convex query when needed.
 */
export async function getGitHubToken(): Promise<string | null> {
  // Check PAT cookie first (simple flow)
  const cookieStore = await cookies()
  const pat = cookieStore.get("github_pat")?.value
  if (pat) {
    return pat
  }

  // For OAuth users, the token is in Convex's accounts table.
  // Pages that need it should fetch it via a Convex query.
  return null
}
