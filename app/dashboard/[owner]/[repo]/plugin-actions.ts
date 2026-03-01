"use server"

import { getGitHubToken } from "@/lib/auth-server"
import { getFileContent } from "@/lib/github"
import { pluginManifestSchema, type PluginManifest } from "@/lib/repopress/plugin-schema"

export async function fetchPluginAction(owner: string, repo: string, branch: string | undefined, pluginPath: string) {
  const token = await getGitHubToken()
  if (!token) {
    return { success: false as const, error: "Unauthorized" }
  }

  try {
    // 1. Fetch manifest (plugin.json)
    const manifestContent = await getFileContent(token, owner, repo, pluginPath, branch)
    if (manifestContent === null) {
      return { success: false as const, error: "Manifest not found" }
    }
    const rawManifest = JSON.parse(manifestContent)
    const manifest = pluginManifestSchema.parse(rawManifest)

    // 2. Fetch entry file source
    // Entry path is relative to plugin.json
    const pluginDir = pluginPath.split("/").slice(0, -1).join("/")
    const entryPath = pluginDir + "/" + manifest.entry.replace(/^\.\//, "")

    const entrySource = await getFileContent(token, owner, repo, entryPath, branch)
    if (entrySource === null) {
      return { success: false as const, error: "Plugin entry not found" }
    }

    return {
      success: true as const,
      manifest,
      source: entrySource,
    }
  } catch (error: any) {
    console.error(`Failed to fetch plugin at ${pluginPath}:`, error)
    return {
      success: false as const,
      error: error.message || "Failed to fetch plugin",
    }
  }
}
