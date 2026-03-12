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

/**
 * Lightweight fallback: probe whether the token can read repo content.
 *
 * `repos.get()` can return 403 for org repos when the OAuth app hasn't been
 * granted org access, but the token may still work for content reads (e.g.
 * public repos, or fine-grained PATs with contents:read scope).
 *
 * If the probe succeeds we return "viewer" as a safe lower bound — we can
 * confirm read access but not push access from a content read alone.
 */
export async function probeRepoReadAccess(token: string, owner: string, repo: string): Promise<Role | null> {
  try {
    const octokit = createGitHubClient(token)
    // List branches (1 result) — lightweight and available on both public and
    // private repos where the token has contents:read.
    await octokit.repos.listBranches({ owner, repo, per_page: 1 })
    return "viewer"
  } catch {
    return null
  }
}
