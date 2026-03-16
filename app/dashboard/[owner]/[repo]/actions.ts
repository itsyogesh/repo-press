"use server"

import { revalidatePath } from "next/cache"
import { api } from "@/convex/_generated/api"
import { fetchAuthMutation, fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import { fetchRepoConfig } from "@/lib/repopress/config"
import { syncProjectsServerSide } from "@/lib/sync-projects"

export async function syncProjectsFromConfigAction(owner: string, repo: string, branch: string) {
  const token = await getGitHubToken()
  if (!token) return { success: false, error: "Not authenticated with GitHub" }

  // Resolve acting user (OAuth or PAT)
  const authUser = fetchAuthQuery ? await fetchAuthQuery(api.auth.getCurrentUser, {}).catch(() => null) : null
  const patUserId = !authUser ? await getPatAuthUserId(token) : null
  const actingUserId = (authUser?._id as string | undefined) ?? patUserId

  if (!actingUserId) return { success: false, error: "No user found" }

  try {
    const result = await syncProjectsServerSide(token, owner, repo, branch, actingUserId)
    if (!result) {
      return { success: false, error: "Config not found or sync failed" }
    }

    revalidatePath(`/dashboard/${owner}/${repo}`)
    return { success: true, count: result.synced.length + result.created.length + result.unchanged.length }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
