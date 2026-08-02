"use server"

import { revalidatePath } from "next/cache"
import { getGitHubToken } from "@/lib/auth-server"
import { getRepoContents } from "@/lib/github"
import { resolveActingUserId } from "@/lib/server-context"
import { syncProjectsServerSide } from "@/lib/sync-projects"

export async function syncProjectsFromConfigAction(owner: string, repo: string, branch: string, configRef?: string) {
  const token = await getGitHubToken()
  if (!token) return { success: false, error: "Not authenticated with GitHub" }

  // Resolve acting user (OAuth or PAT)
  const actingUserId = await resolveActingUserId(token)

  if (!actingUserId) return { success: false, error: "No user found" }

  try {
    // Studio-triggered syncs may use any branch; skip orphan detection to
    // avoid falsely flagging projects absent from a non-canonical branch's config.
    const result = await syncProjectsServerSide(token, owner, repo, branch, actingUserId, {
      runOrphanDetection: false,
      ...(configRef ? { configRef } : {}),
    })
    if (!result) {
      return { success: false, error: "Config not found or sync failed" }
    }

    revalidatePath(`/dashboard/${owner}/${repo}`)
    return {
      success: true,
      count: result.synced.length + result.created.length + result.unchanged.length,
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function fetchRepoDirsAction(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<{ success: true; dirs: { name: string; path: string }[] } | { success: false; error: string }> {
  const token = await getGitHubToken()
  if (!token) return { success: false, error: "Not authenticated with GitHub" }

  try {
    const contents = await getRepoContents(token, owner, repo, path, branch)
    const dirs = contents
      .filter((entry) => entry.type === "dir")
      .map((entry) => ({ name: entry.name, path: entry.path }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { success: true, dirs }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
