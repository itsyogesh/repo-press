import { auth } from "@/lib/auth"
import { headers, cookies } from "next/headers"

export async function getServerSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  return session
}

/**
 * Get GitHub access token from either Better Auth session or PAT cookie.
 * Returns null if no valid token is found.
 */
export async function getGitHubToken(): Promise<string | null> {
  // First try Better Auth session (GitHub OAuth gives us an access token via the accounts table)
  const session = await getServerSession()

  if (session?.user) {
    // The GitHub access token is stored in the accounts table by Better Auth
    // We can also check if the user has a stored token on their profile
    const user = session.user as { githubAccessToken?: string }
    if (user.githubAccessToken) {
      return user.githubAccessToken
    }
  }

  // Fallback to PAT cookie
  const cookieStore = await cookies()
  const pat = cookieStore.get("github_pat")?.value
  if (pat) {
    return pat
  }

  return null
}

/**
 * Get current user ID from Better Auth session.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession()
  return session?.user?.id ?? null
}
