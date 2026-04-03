"use server"

import { revalidatePath } from "next/cache"
import { api } from "@/convex/_generated/api"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import type { ProjectConfig } from "@/lib/config-schema"
import {
  addProject,
  commitConfig,
  type NewProjectDef,
  readConfig,
  removeProject,
  updateProject,
} from "@/lib/repopress/config-writer"
import { syncProjectsServerSide } from "@/lib/sync-projects"

// ── Shared helpers ────────────────────────────────────────────────

async function resolveAuthContext() {
  const token = await getGitHubToken()
  if (!token) throw new Error("Not authenticated with GitHub")

  const authUser = fetchAuthQuery ? await fetchAuthQuery(api.auth.getCurrentUser, {}).catch(() => null) : null
  const patUserId = !authUser ? await getPatAuthUserId(token) : null
  const actingUserId = (authUser?._id as string | undefined) ?? patUserId

  if (!actingUserId) throw new Error("No authenticated user found")

  return { token, actingUserId }
}

async function fetchConfigOrThrow(token: string, owner: string, repo: string, branch: string) {
  const result = await readConfig(token, owner, repo, branch)
  if (!result.config || !result.sha) {
    throw new Error(result.error ?? "Failed to fetch repopress.config.json")
  }
  return { config: result.config, sha: result.sha }
}

type ConfigActionResult =
  | { success: true; syncResult?: { synced: string[]; created: string[]; unchanged: string[] } }
  | { success: false; error: string }

// ── Server actions ────────────────────────────────────────────────

/**
 * Adds a new project to repopress.config.json on GitHub, then syncs to Convex.
 */
export async function addProjectToConfigAction(
  owner: string,
  repo: string,
  branch: string,
  project: NewProjectDef,
): Promise<ConfigActionResult> {
  try {
    const { token, actingUserId } = await resolveAuthContext()

    // Validate that contentRoot exists as a directory in the repo before committing.
    // Empty contentRoot means repo root — always valid, skip the check.
    // Note: getRepoContents swallows 404 and returns []. We call Octokit directly here
    // so we can distinguish "not found" from "transient error".
    if (project.contentRoot) {
      const { createGitHubClient } = await import("@/lib/github")
      const octokit = createGitHubClient(token)
      try {
        const { data } = await octokit.repos.getContent({
          owner,
          repo,
          path: project.contentRoot,
          ref: branch,
        })
        if (!Array.isArray(data)) {
          return {
            success: false,
            error: `"${project.contentRoot}" is a file, not a folder. Enter a folder path.`,
          }
        }
      } catch (err: any) {
        if (err.status === 404) {
          return {
            success: false,
            error: `Folder "${project.contentRoot}" does not exist in this repository on branch "${branch}".`,
          }
        }
        if (err.status === 403) {
          return {
            success: false,
            error: `GitHub API rate limit exceeded while validating content root. Please try again in a few minutes.`,
          }
        }
        return {
          success: false,
          error: `Failed to validate content root "${project.contentRoot}": ${err.message ?? "unexpected error"}. Please check the path and try again.`,
        }
      }
    }

    const { config, sha } = await fetchConfigOrThrow(token, owner, repo, branch)

    const updatedConfig = addProject(config, project)
    await commitConfig(
      token,
      owner,
      repo,
      branch,
      updatedConfig,
      sha,
      `chore(repopress): add project "${project.name}"`,
    )

    const syncResult = await syncProjectsServerSide(token, owner, repo, branch, actingUserId)
    revalidatePath(`/dashboard/${owner}/${repo}`)
    return { success: true, syncResult: syncResult ?? undefined }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Updates an existing project in repopress.config.json on GitHub, then syncs.
 */
export async function updateProjectInConfigAction(
  owner: string,
  repo: string,
  branch: string,
  configProjectId: string,
  updates: Partial<Pick<ProjectConfig, "name" | "framework" | "contentType" | "branch" | "preview" | "components">>,
): Promise<ConfigActionResult> {
  try {
    const { token, actingUserId } = await resolveAuthContext()
    const { config, sha } = await fetchConfigOrThrow(token, owner, repo, branch)

    const updatedConfig = updateProject(config, configProjectId, updates)
    await commitConfig(
      token,
      owner,
      repo,
      branch,
      updatedConfig,
      sha,
      `chore(repopress): update project "${configProjectId}"`,
    )

    const syncResult = await syncProjectsServerSide(token, owner, repo, branch, actingUserId)
    revalidatePath(`/dashboard/${owner}/${repo}`)
    return { success: true, syncResult: syncResult ?? undefined }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Removes a project from repopress.config.json on GitHub, then syncs.
 * After sync, orphan detection will flag the removed project in Convex.
 */
export async function removeProjectFromConfigAction(
  owner: string,
  repo: string,
  branch: string,
  configProjectId: string,
): Promise<ConfigActionResult> {
  try {
    const { token, actingUserId } = await resolveAuthContext()
    const { config, sha } = await fetchConfigOrThrow(token, owner, repo, branch)

    const updatedConfig = removeProject(config, configProjectId)
    await commitConfig(
      token,
      owner,
      repo,
      branch,
      updatedConfig,
      sha,
      `chore(repopress): remove project "${configProjectId}"`,
    )

    const syncResult = await syncProjectsServerSide(token, owner, repo, branch, actingUserId)
    revalidatePath(`/dashboard/${owner}/${repo}`)
    return { success: true, syncResult: syncResult ?? undefined }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Commits a raw (pre-validated) config to GitHub, then syncs.
 * Used by the advanced raw config editor.
 */
export async function commitRawConfigAction(
  owner: string,
  repo: string,
  branch: string,
  rawJson: string,
  currentSha: string,
): Promise<ConfigActionResult> {
  try {
    const { token, actingUserId } = await resolveAuthContext()

    // Parse and validate before committing
    let parsed: unknown
    try {
      parsed = JSON.parse(rawJson)
    } catch {
      return { success: false, error: "Invalid JSON format" }
    }

    const { repoPressConfigSchema } = await import("@/lib/config-schema")
    const validated = repoPressConfigSchema.safeParse(parsed)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
      return { success: false, error: `Validation failed: ${errors}` }
    }

    await commitConfig(
      token,
      owner,
      repo,
      branch,
      validated.data,
      currentSha,
      "chore(repopress): update config via raw editor",
    )

    const syncResult = await syncProjectsServerSide(token, owner, repo, branch, actingUserId)
    revalidatePath(`/dashboard/${owner}/${repo}`)
    return { success: true, syncResult: syncResult ?? undefined }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
