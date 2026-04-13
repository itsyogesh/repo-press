"use server"

import { api } from "@/convex/_generated/api"
import { getGitHubToken } from "@/lib/auth-server"
import { fetchRepoConfig } from "@/lib/repopress/config"
import { createServerQueryContext, resolveActingUserId } from "@/lib/server-context"

/**
 * Server-side project sync from repopress.config.json.
 * Works for both OAuth and PAT users (reads token from cookies).
 * Uses ConvexHttpClient + serverQueryToken — does NOT require fetchAuthMutation.
 */
export async function syncProjectsServerSide(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  actingUserId: string,
  {
    runOrphanDetection = true,
    restoredConfigProjectIds,
  }: { runOrphanDetection?: boolean; restoredConfigProjectIds?: string[] } = {},
): Promise<{ synced: string[]; created: string[]; unchanged: string[]; orphaned?: string[] } | null> {
  const { config } = await fetchRepoConfig(token, owner, repo, branch)
  if (!config) return null

  const projectsToSync = config.projects.map((p) => ({
    configProjectId: p.id,
    name: p.name,
    contentRoot: p.contentRoot,
    framework: p.framework === "auto" ? "detected" : p.framework,
    contentType: p.contentType as "blog" | "docs" | "pages" | "changelog" | "custom",
    branch: p.branch || config.defaults?.branch || branch,
    previewEntry: p.preview?.entry || config.defaults?.preview?.entry,
    enabledPlugins: p.preview?.plugins || config.defaults?.preview?.plugins,
    components: p.components,
  }))

  const { convex, serverQueryToken } = await createServerQueryContext()

  const result = await convex.mutation(api.projects.syncProjectsFromConfig, {
    actingUserId,
    serverQueryToken,
    repoOwner: owner,
    repoName: repo,
    branch,
    configVersion: config.version,
    configPath: "repopress.config.json",
    pluginRegistry: config.plugins,
    runOrphanDetection,
    restoredConfigProjectIds,
    projects: projectsToSync,
  })

  if (result) {
    const parts = [`Sync complete for ${owner}/${repo}:`]
    if (result.created.length) parts.push(`${result.created.length} created`)
    if (result.synced.length) parts.push(`${result.synced.length} updated`)
    if (result.unchanged.length) parts.push(`${result.unchanged.length} unchanged`)
    if ((result as any).orphaned?.length) parts.push(`${(result as any).orphaned.length} orphaned`)
    console.log(parts.join(" "))
  }

  return result
}

/**
 * Server action: retry sync from the hub or setup page.
 * Resolves the acting user from cookies (works for both OAuth and PAT).
 */
export async function retrySyncAction(owner: string, repo: string, branch: string) {
  const token = await getGitHubToken()
  if (!token) throw new Error("Unauthorized")

  const actingUserId = await resolveActingUserId(token)
  if (!actingUserId) throw new Error("Unauthorized")

  return syncProjectsServerSide(token, owner, repo, branch, actingUserId)
}
