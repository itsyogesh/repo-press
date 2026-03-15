import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import { createGitHubClient } from "@/lib/github"
import { mintServerQueryToken } from "@/lib/project-access-token"

export type Role = "owner" | "editor" | "viewer"

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
}

export function roleAtLeast(actual: Role, minimum: Role): boolean {
  return ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[minimum]
}

export interface RepoRoleResult {
  role: Role | null
  defaultBranch: string | null
  /**
   * True when `defaultBranch` was inferred heuristically (main > master > first branch)
   * rather than read from GitHub's `repos.get()` response. Callers should let users
   * confirm/override the branch when this is true.
   *
   * The GitHub REST API does not expose `default_branch` outside `repos.get()`.
   * When that endpoint returns 403 (common for org repos without org-level OAuth
   * access), the probe path infers a branch from `listBranches`. This covers ~95%
   * of repos but can be wrong for repos using `develop`, `trunk`, etc.
   */
  defaultBranchInferred: boolean
}

/**
 * Get the calling user's role on a GitHub repo by reading the `permissions`
 * object from `GET /repos/{owner}/{repo}`.
 *
 * Also extracts `default_branch` from the same API call — callers that need
 * the real default branch can destructure it without an extra request.
 *
 * - admin → "owner"
 * - push  → "editor"
 * - pull  → "viewer"
 * - none / 404 → { role: null, defaultBranch: null }
 */
export async function getRepoRole(token: string, owner: string, repo: string): Promise<RepoRoleResult> {
  try {
    const octokit = createGitHubClient(token)
    const { data } = await octokit.repos.get({ owner, repo })
    const perms = data.permissions
    const defaultBranch = data.default_branch ?? null

    if (!perms) return { role: null, defaultBranch, defaultBranchInferred: false }
    if (perms.admin) return { role: "owner", defaultBranch, defaultBranchInferred: false }
    if (perms.push) return { role: "editor", defaultBranch, defaultBranchInferred: false }
    if (perms.pull) return { role: "viewer", defaultBranch, defaultBranchInferred: false }
    return { role: null, defaultBranch, defaultBranchInferred: false }
  } catch (error: unknown) {
    const status = typeof error === "object" && error && "status" in error ? (error as any).status : undefined
    if (status === 404 || status === 403) return { role: null, defaultBranch: null, defaultBranchInferred: false }
    throw error
  }
}

interface ProbeResult {
  role: Role | null
  defaultBranch: string | null
}

/**
 * Probe repo read access AND infer a default branch hint from the branch list.
 *
 * Used internally by `resolveRepoRole` to avoid a redundant API call when
 * `repos.get()` returns 403 (which means we have no `default_branch`).
 */
async function probeRepoReadAccessWithBranch(
  token: string,
  owner: string,
  repo: string,
): Promise<ProbeResult> {
  try {
    const octokit = createGitHubClient(token)
    // Fetch enough branches to reliably detect main/master
    const { data: branches } = await octokit.repos.listBranches({ owner, repo, per_page: 100 })
    // Infer default branch heuristically
    const hasMain = branches.find((b) => b.name === "main")
    const hasMaster = branches.find((b) => b.name === "master")
    const defaultBranch = hasMain ? "main" : hasMaster ? "master" : branches[0]?.name ?? null
    return { role: "viewer", defaultBranch }
  } catch {
    return { role: null, defaultBranch: null }
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
  const { role } = await probeRepoReadAccessWithBranch(token, owner, repo)
  return role
}

/**
 * Full 4-tier role resolution for a repo.
 *
 * 1. GitHub API permissions (getRepoRole)
 * 2. Convex repoAccessCache (seeded by prior studio visits — preserves real role for org editors)
 * 3. Content read probe (safe lower bound: "viewer")
 *
 * Callers that also need ownership checks should do so before calling this
 * (ownership is project-specific, not repo-level).
 *
 * Returns { role, defaultBranch } — `defaultBranch` comes from step 1 when available.
 */
export async function resolveRepoRole(
  token: string,
  owner: string,
  repo: string,
  actingUserId?: string | null,
): Promise<RepoRoleResult> {
  // 1. GitHub API (authoritative default branch)
  const { role: githubRole, defaultBranch } = await getRepoRole(token, owner, repo)
  if (githubRole) return { role: githubRole, defaultBranch, defaultBranchInferred: false }

  // 2. Convex access cache
  if (actingUserId) {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (convexUrl) {
      try {
        const convex = new ConvexHttpClient(convexUrl)
        const sqt = await mintServerQueryToken()
        const cached = await convex.query(api.repoAccessCache.getForUserPublic, {
          repoOwner: owner,
          repoName: repo,
          userId: actingUserId,
          serverQueryToken: sqt,
        })
        if (cached) {
          // Cache doesn't store defaultBranch — if we don't have it from step 1,
          // we'll still need the probe to infer it below.
          if (defaultBranch) {
            return { role: cached.role as Role, defaultBranch, defaultBranchInferred: false }
          }
          // Got role from cache but no branch — probe for branch hint only
          const probe = await probeRepoReadAccessWithBranch(token, owner, repo)
          return {
            role: cached.role as Role,
            defaultBranch: probe.defaultBranch,
            defaultBranchInferred: !!probe.defaultBranch,
          }
        }
      } catch {
        // Cache lookup failed — continue to probe
      }
    }
  }

  // 3. Content probe (lower bound: "viewer") — also extracts default branch hint
  const probe = await probeRepoReadAccessWithBranch(token, owner, repo)
  const branchFromProbe = defaultBranch ?? probe.defaultBranch
  return {
    role: probe.role,
    defaultBranch: branchFromProbe,
    defaultBranchInferred: !defaultBranch && !!branchFromProbe,
  }
}
