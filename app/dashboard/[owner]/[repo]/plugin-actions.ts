"use server"

import { getGitHubToken } from "@/lib/auth-server"
import { getFileContent } from "@/lib/github"
import {
  buildRequestScopeId,
  executeGitHubRequest,
  isGitHubRateLimitError,
} from "@/lib/repopress/github-request-control"
import { pluginManifestSchema } from "@/lib/repopress/plugin-schema"
import { collectRepoModuleBundle } from "@/lib/repopress/repo-module-bundle"

export async function fetchPluginAction(owner: string, repo: string, branch: string | undefined, pluginPath: string) {
  const token = await getGitHubToken()
  if (!token) {
    return { success: false as const, error: "Unauthorized" }
  }
  const scope = buildRequestScopeId(token)

  try {
    // 1. Fetch manifest (plugin.json)
    const manifestResponse = await executeGitHubRequest({
      key: `plugin-manifest:${scope}:${owner}/${repo}@${branch}:${pluginPath}`,
      request: () => getFileContent(token, owner, repo, pluginPath, branch),
    })
    const manifestContent = manifestResponse.value
    if (manifestContent === null) {
      return { success: false as const, error: "Manifest not found" }
    }
    const rawManifest = JSON.parse(manifestContent)
    const manifest = pluginManifestSchema.parse(rawManifest)

    // 2. Fetch entry file source
    // Entry path is relative to plugin.json
    const pluginDir = pluginPath.split("/").slice(0, -1).join("/")
    const entryPath = `${pluginDir}/${manifest.entry.replace(/^\.\//, "")}`

    const bundle = await collectRepoModuleBundle({
      token,
      owner,
      repo,
      branch: branch || "main",
      entryPath,
    })
    if (!bundle.entrySource) {
      return { success: false as const, error: "Plugin entry not found" }
    }

    return {
      success: true as const,
      manifest,
      source: bundle.entrySource,
      entryPath: bundle.entryPath,
      sources: bundle.sources,
      sha: bundle.sha,
      rateLimited: manifestResponse.rateLimited || bundle.rateLimited,
      retryCount: manifestResponse.retryCount + bundle.retryCount,
    }
  } catch (error: any) {
    if (isGitHubRateLimitError(error)) {
      return {
        success: false as const,
        error: "GitHub rate limit reached while loading plugin. Please retry in a moment.",
      }
    }
    console.error(`Failed to fetch plugin at ${pluginPath}:`, error)
    return {
      success: false as const,
      error: error.message || "Failed to fetch plugin",
    }
  }
}
