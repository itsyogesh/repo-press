"use server"

import { getGitHubToken } from "@/lib/auth-server"
import { getFile } from "@/lib/github"
import {
  buildRequestScopeId,
  executeGitHubRequest,
  isGitHubRateLimitError,
} from "@/lib/repopress/github-request-control"

export async function fetchAdapterSourceAction(owner: string, repo: string, branch: string, entryPath: string) {
  const token = await getGitHubToken()
  if (!token) return { success: false, error: "Not authenticated with GitHub" }
  const scope = buildRequestScopeId(token)

  try {
    const requestResult = await executeGitHubRequest({
      key: `adapter:${scope}:${owner}/${repo}@${branch}:${entryPath}`,
      request: () => getFile(token, owner, repo, entryPath, branch),
    })
    const file = requestResult.value
    if (!file) {
      return {
        success: false,
        error: `Adapter file not found at ${entryPath}`,
      }
    }

    return {
      success: true,
      source: file.content,
      sha: file.sha,
      rateLimited: requestResult.rateLimited,
      retryCount: requestResult.retryCount,
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
