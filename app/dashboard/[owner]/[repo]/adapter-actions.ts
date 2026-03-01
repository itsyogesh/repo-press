"use server"

import { getGitHubToken } from "@/lib/auth-server"
import { getFileContent } from "@/lib/github"

export async function fetchAdapterSourceAction(owner: string, repo: string, branch: string, entryPath: string) {
  const token = await getGitHubToken()
  if (!token) return { success: false, error: "Not authenticated with GitHub" }

  try {
    const content = await getFileContent(token, owner, repo, entryPath, branch)

    if (!content) {
      return {
        success: false,
        error: `Adapter file not found at ${entryPath}`,
      }
    }

    return { success: true, source: content }
  } catch (error: any) {
    if (error.status === 404) {
      return {
        success: false,
        error: `Adapter file not found at ${entryPath} (404)`,
      }
    }
    return { success: false, error: `GitHub API error: ${error.message}` }
  }
}
