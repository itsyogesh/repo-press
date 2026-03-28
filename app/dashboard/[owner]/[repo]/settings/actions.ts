"use server"

import { deleteFileContent, saveFileContent } from "@/lib/github"
import { fetchRepoConfig } from "@/lib/repopress/config"

interface RemoveProjectFromConfigResult {
  success: true
  deletedFile: boolean
}

interface RemoveProjectFromConfigError {
  success: false
  error: string
}

/**
 * Removes a project entry from repopress.config.json on GitHub.
 *
 * If the project being removed is the last one in the config, the entire
 * config file is deleted. Otherwise, the file is updated with the project
 * entry removed.
 *
 * Returns success: true on success, or success: false with an error message.
 */
export async function removeProjectFromConfig(
  owner: string,
  repo: string,
  branch: string,
  configProjectId: string,
  githubToken: string,
): Promise<RemoveProjectFromConfigResult | RemoveProjectFromConfigError> {
  // 1. Fetch current config from GitHub
  const { config, sha, error, errorType } = await fetchRepoConfig(githubToken, owner, repo, branch)

  if (!config || !sha) {
    // Config doesn't exist — nothing to remove, consider it a no-op success
    if (errorType === "not-found") {
      return { success: true, deletedFile: false }
    }
    return {
      success: false,
      error: error ?? "Failed to fetch repopress.config.json",
    }
  }

  // 2. Check if this project exists in the config
  const projectIndex = config.projects.findIndex((p) => p.id === configProjectId)
  if (projectIndex === -1) {
    // Project not in config — no-op
    return { success: true, deletedFile: false }
  }

  // 3. Build the updated projects list
  const remainingProjects = config.projects.filter((p) => p.id !== configProjectId)

  // 4. If no projects remain, delete the config file
  if (remainingProjects.length === 0) {
    try {
      await deleteFileContent(
        githubToken,
        owner,
        repo,
        "repopress.config.json",
        sha,
        `chore: remove project "${configProjectId}" from RepoPress config`,
        branch,
      )
      return { success: true, deletedFile: true }
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to delete repopress.config.json: ${err.message}`,
      }
    }
  }

  // 5. Otherwise, update the config file with the project removed
  try {
    const updatedConfig = JSON.stringify(config, null, 2)
    await saveFileContent(
      githubToken,
      owner,
      repo,
      "repopress.config.json",
      updatedConfig,
      sha,
      `chore: remove project "${configProjectId}" from RepoPress config`,
      branch,
    )
    return { success: true, deletedFile: false }
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to update repopress.config.json: ${err.message}`,
    }
  }
}
