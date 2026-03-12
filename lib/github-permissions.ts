import { createGitHubClient } from "@/lib/github"

type Role = "owner" | "editor" | "viewer"

/**
 * Get the calling user's role on a GitHub repo by reading the `permissions`
 * object from `GET /repos/{owner}/{repo}`.
 *
 * - admin → "owner"
 * - push  → "editor"
 * - pull  → "viewer"
 * - none / 404 → null
 */
export async function getRepoRole(token: string, owner: string, repo: string): Promise<Role | null> {
  try {
    const octokit = createGitHubClient(token)
    const { data } = await octokit.repos.get({ owner, repo })
    const perms = data.permissions

    if (!perms) return null
    if (perms.admin) return "owner"
    if (perms.push) return "editor"
    if (perms.pull) return "viewer"
    return null
  } catch (error: unknown) {
    const status = typeof error === "object" && error && "status" in error ? (error as any).status : undefined
    if (status === 404 || status === 403) return null
    throw error
  }
}
