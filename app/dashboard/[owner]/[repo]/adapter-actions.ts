"use server"

import { getGitHubToken } from "@/lib/auth-server"
import { isGitHubRateLimitError } from "@/lib/repopress/github-request-control"
import { collectRepoModuleBundle } from "@/lib/repopress/repo-module-bundle"

export async function fetchAdapterSourceAction(owner: string, repo: string, branch: string, entryPath: string) {
  const token = await getGitHubToken()
  if (!token) return { success: false, error: "Not authenticated with GitHub" }

  try {
    const bundle = await collectRepoModuleBundle({
      token,
      owner,
      repo,
      branch,
      entryPath,
    })
    if (!bundle.entrySource) {
      return {
        success: false,
        error: `Adapter file not found at ${entryPath}`,
      }
    }

    return {
      success: true,
      source: bundle.entrySource,
      entryPath: bundle.entryPath,
      sources: bundle.sources,
      sha: bundle.sha,
      rateLimited: bundle.rateLimited,
      retryCount: bundle.retryCount,
    }
  } catch (error: any) {
    if (error.status === 404) {
      return {
        success: false,
        error: `Adapter file not found at ${entryPath} (404)`,
      }
    }
    if (isGitHubRateLimitError(error)) {
      return {
        success: false,
        error: "GitHub rate limit reached while loading adapter. Please retry in a moment.",
      }
    }
    return { success: false, error: `GitHub API error: ${error.message}` }
  }
}
