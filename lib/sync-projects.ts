"use server"

import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { fetchRepoConfig } from "@/lib/repopress/config"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

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
): Promise<{ synced: string[]; created: string[]; unchanged: string[] } | null> {
  if (!convexUrl) return null

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

  const convex = new ConvexHttpClient(convexUrl)
  const serverQueryToken = await mintServerQueryToken()

  const result = await convex.mutation(api.projects.syncProjectsFromConfig, {
    actingUserId,
    serverQueryToken,
    repoOwner: owner,
    repoName: repo,
    branch,
    configVersion: config.version,
    configPath: "repopress.config.json",
    pluginRegistry: config.plugins,
    projects: projectsToSync,
  })

  return result
}

/**
 * Server action: retry sync from the hub or setup page.
 * Resolves the acting user from cookies (works for both OAuth and PAT).
 */
export async function retrySyncAction(owner: string, repo: string, branch: string) {
  const token = await getGitHubToken()
  if (!token) throw new Error("Unauthorized")

  const authUser = fetchAuthQuery ? await fetchAuthQuery(api.auth.getCurrentUser).catch(() => null) : null
  const patUserId = !authUser ? await getPatAuthUserId(token) : null
  const actingUserId = (authUser?._id as string | undefined) ?? patUserId

  if (!actingUserId) throw new Error("Unauthorized")

  return syncProjectsServerSide(token, owner, repo, branch, actingUserId)
}
