"use server"

import { api } from "@/convex/_generated/api"
import { getGitHubToken } from "@/lib/auth-server"
import { buildDetectionContext, detectFrameworkFromContext } from "@/lib/framework-adapters/registry"
import { fetchRepoConfig } from "@/lib/repopress/config"
import { resolveResolvedRuntime } from "@/lib/repopress/resolved-runtime"
import { createServerQueryContext, resolveActingUserId } from "@/lib/server-context"

/**
 * Server-side project sync from repopress.config.json.
 * Works for both OAuth and PAT users (reads token from cookies).
 * Uses ConvexHttpClient + serverQueryToken - does NOT require fetchAuthMutation.
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

  const detectionContexts = new Map<string, Awaited<ReturnType<typeof buildDetectionContext>>>()
  const getDetectionContext = async (contentRoot: string) => {
    const key = contentRoot || ""
    if (!detectionContexts.has(key)) {
      detectionContexts.set(key, await buildDetectionContext(token, owner, repo, branch, contentRoot))
    }
    return detectionContexts.get(key)!
  }

  const projectsToSync = await Promise.all(
    config.projects.map(async (p) => {
      const previewEntry = p.preview?.entry || config.defaults?.preview?.entry
      const base = {
        configProjectId: p.id,
        name: p.name,
        contentRoot: p.contentRoot,
        contentType: p.contentType as "blog" | "docs" | "pages" | "changelog" | "custom",
        branch: p.branch || config.defaults?.branch || branch,
        previewEntry,
        enabledPlugins: p.preview?.plugins || config.defaults?.preview?.plugins,
        components: p.components,
      }

      try {
        const detectionContext = await getDetectionContext(p.contentRoot)
        const detectedFramework =
          p.framework === "auto" || p.framework === "detected"
            ? (await detectFrameworkFromContext(detectionContext)).framework
            : p.framework
        const resolvedRuntime = await resolveResolvedRuntime({
          owner,
          repo,
          branch,
          framework: detectedFramework,
          contentRoot: p.contentRoot,
          overrideEntry: previewEntry,
          readFile: detectionContext.readFile,
        })

        return { ...base, framework: detectedFramework, resolvedRuntime }
      } catch (error) {
        // A single project's detection failure (rate limit, 404, parse error) must not
        // abort the whole sync. Fall back to syncing without resolvedRuntime.
        console.error(
          `[RepoPress] Runtime detection failed for project ${p.id} (${owner}/${repo}); syncing without resolvedRuntime.`,
          error,
        )
        const framework = p.framework === "auto" || p.framework === "detected" ? "custom" : p.framework
        return { ...base, framework, resolvedRuntime: undefined }
      }
    }),
  )

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
