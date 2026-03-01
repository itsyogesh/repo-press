"use server"

import { getGitHubToken, fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server"
import { fetchRepoConfig } from "@/lib/repopress/config"
import { api } from "@/convex/_generated/api"
import { revalidatePath } from "next/cache"

export async function syncProjectsFromConfigAction(owner: string, repo: string, branch: string) {
  const token = await getGitHubToken()
  if (!token) return { success: false, error: "Not authenticated with GitHub" }

  if (!fetchAuthQuery || !fetchAuthMutation) {
    return { success: false, error: "Auth is not configured" }
  }

  const user = await fetchAuthQuery(api.auth.getCurrentUser, {})
  if (!user || !user._id) return { success: false, error: "No user found" }

  const result = await fetchRepoConfig(token, owner, repo, branch)
  if (result.error || !result.config) {
    return { success: false, error: result.error }
  }

  const { config } = result

  // Prepare data for convex
  const projectsToSync = config.projects.map((p) => ({
    configProjectId: p.id,
    name: p.name,
    contentRoot: p.contentRoot,
    framework: p.framework === "auto" ? "detected" : p.framework,
    contentType: p.contentType as any,
    branch: p.branch || config.defaults?.branch || branch,
    previewEntry: p.preview?.entry || config.defaults?.preview?.entry,
    enabledPlugins: p.preview?.plugins || config.defaults?.preview?.plugins,
  }))

  try {
    await fetchAuthMutation(api.projects.syncProjectsFromConfig, {
      userId: user._id,
      repoOwner: owner,
      repoName: repo,
      branch: branch,
      configVersion: config.version,
      configPath: "repopress.config.json",
      pluginRegistry: config.plugins,
      projects: projectsToSync,
    })

    revalidatePath(`/dashboard/${owner}/${repo}`)
    return { success: true, count: projectsToSync.length }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
