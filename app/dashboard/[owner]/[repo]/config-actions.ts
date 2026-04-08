"use server"

import { ConvexHttpClient } from "convex/browser"
import { revalidatePath } from "next/cache"
import { api } from "@/convex/_generated/api"
import { fetchAuthQuery, getGitHubToken, getPatAuthUserId } from "@/lib/auth-server"
import type { ProjectConfig } from "@/lib/config-schema"
import { resolveRepoRole, roleAtLeast } from "@/lib/github-permissions"
import { mintProjectAccessToken, mintServerQueryToken } from "@/lib/project-access-token"
import {
  addProject,
  commitConfig,
  type NewProjectDef,
  readConfig,
  removeProject,
  updateProject,
} from "@/lib/repopress/config-writer"
import { syncProjectsServerSide } from "@/lib/sync-projects"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

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

/** Verify the caller has write-level access to the repo before mutating config. */
async function requireWriteAccess(token: string, owner: string, repo: string, actingUserId: string) {
  const { role } = await resolveRepoRole(token, owner, repo, actingUserId)
  if (!role || !roleAtLeast(role, "editor")) {
    throw new Error("Unauthorized: write access required to modify project config")
  }
}

async function fetchConfigOrThrow(token: string, owner: string, repo: string, branch: string) {
  const result = await readConfig(token, owner, repo, branch)
  if (!result.config || !result.sha) {
    throw new Error(result.error ?? "Failed to fetch repopress.config.json")
  }
  return { config: result.config, sha: result.sha }
}

function getAddedConfigProjectIds(previousIds: string[], nextIds: string[]) {
  const existingIds = new Set(previousIds)
  return nextIds.filter((id) => !existingIds.has(id))
}

function getConfigProjectIdsFromJson(rawJson: string) {
  try {
    const parsed = JSON.parse(rawJson) as { projects?: Array<{ id?: string }> }
    if (!Array.isArray(parsed.projects)) return []
    return parsed.projects.flatMap((project) => (typeof project.id === "string" ? [project.id] : []))
  } catch {
    return []
  }
}

type ConfigActionResult =
  | { success: true; syncResult?: { synced: string[]; created: string[]; unchanged: string[] } }
  | { success: false; error: string }

type ProjectResolutionResult = {
  project: {
    _id: string
    repoOwner: string
    repoName: string
    branch: string
  }
  token: string
  actingUserId: string
  projectAccessToken: string
}

async function resolveProjectOwnerActionContext(projectId: string): Promise<ProjectResolutionResult> {
  const { token, actingUserId } = await resolveAuthContext()
  const serverQueryToken = await mintServerQueryToken()
  const project = await convex.query(api.projects.get, {
    id: projectId as never,
    serverQueryToken,
  })

  if (!project) {
    throw new Error("Project not found")
  }

  const { role } = await resolveRepoRole(token, project.repoOwner, project.repoName, actingUserId)
  if (role !== "owner") {
    throw new Error("Unauthorized: owner access required")
  }

  const projectAccessToken = await mintProjectAccessToken({
    projectId,
    userId: actingUserId,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    branch: project.branch,
    role: "owner",
  })

  return { token, actingUserId, project, projectAccessToken }
}

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
    await requireWriteAccess(token, owner, repo, actingUserId)

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
        // Non-404 errors (rate limit, network) — allow through so a transient failure doesn't block creation
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

    const syncResult = await syncProjectsServerSide(token, owner, repo, branch, actingUserId, {
      restoredConfigProjectIds: [project.id],
    })
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
    await requireWriteAccess(token, owner, repo, actingUserId)
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
 *
 * If the project is already absent from the config (e.g. the config was
 * manually cleared), we skip the commit and go straight to sync so that
 * Convex's orphan detection can flag/clean up the stale project record.
 */
export async function removeProjectFromConfigAction(
  owner: string,
  repo: string,
  branch: string,
  configProjectId: string,
): Promise<ConfigActionResult> {
  try {
    const { token, actingUserId } = await resolveAuthContext()
    await requireWriteAccess(token, owner, repo, actingUserId)
    const { config, sha } = await fetchConfigOrThrow(token, owner, repo, branch)

    let skipCommit = false
    let updatedConfig: typeof config
    try {
      updatedConfig = removeProject(config, configProjectId)
    } catch (err: any) {
      if (err.message?.includes("not found in config")) {
        // Project is already absent — idempotent success. Skip the GitHub commit
        // and fall through to sync so Convex orphan detection can clean up.
        skipCommit = true
      } else {
        throw err
      }
    }

    if (!skipCommit) {
      await commitConfig(
        token,
        owner,
        repo,
        branch,
        updatedConfig!,
        sha,
        `chore(repopress): remove project "${configProjectId}"`,
      )
    }
    // If the project is not in the config, skip the commit — it was already
    // removed (e.g. the config was manually cleared). The sync below will
    // trigger orphan detection and flag the Convex record appropriately.

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
  previousJson: string,
): Promise<ConfigActionResult> {
  try {
    const { token, actingUserId } = await resolveAuthContext()
    await requireWriteAccess(token, owner, repo, actingUserId)

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

    const restoredConfigProjectIds = getAddedConfigProjectIds(
      getConfigProjectIdsFromJson(previousJson),
      validated.data.projects.map((project) => project.id),
    )

    await commitConfig(
      token,
      owner,
      repo,
      branch,
      validated.data,
      currentSha,
      "chore(repopress): update config via raw editor",
    )

    const syncResult =
      restoredConfigProjectIds.length > 0
        ? await syncProjectsServerSide(token, owner, repo, branch, actingUserId, {
            restoredConfigProjectIds,
          })
        : await syncProjectsServerSide(token, owner, repo, branch, actingUserId)
    revalidatePath(`/dashboard/${owner}/${repo}`)
    return { success: true, syncResult: syncResult ?? undefined }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function keepProjectAsManualAction(
  projectId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { project, actingUserId, projectAccessToken } = await resolveProjectOwnerActionContext(projectId)

    await convex.mutation(api.projects.keepAsManual, {
      projectId: projectId as never,
      userId: actingUserId,
      projectAccessToken,
    })

    revalidatePath(`/dashboard/${project.repoOwner}/${project.repoName}`)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteProjectPermanentlyAction(
  projectId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { project, actingUserId, projectAccessToken } = await resolveProjectOwnerActionContext(projectId)

    await convex.mutation(api.projects.removeFull, {
      projectId: projectId as never,
      userId: actingUserId,
      projectAccessToken,
    })

    revalidatePath(`/dashboard/${project.repoOwner}/${project.repoName}`)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Batch-removes all orphaned (configRemoved) projects for a repository.
 * Requires owner-level access (consistent with per-project delete).
 */
export async function cleanUpAllOrphansAction(
  owner: string,
  repo: string,
): Promise<{ success: true; removed: number; remaining: number } | { success: false; error: string }> {
  try {
    const { token, actingUserId } = await resolveAuthContext()

    // Require owner role — consistent with deleteProjectPermanentlyAction
    const { role } = await resolveRepoRole(token, owner, repo, actingUserId)
    if (role !== "owner") {
      throw new Error("Unauthorized: owner access required to remove all orphans")
    }

    const serverQueryToken = await mintServerQueryToken()
    const result = await convex.mutation(api.projects.removeAllOrphans, {
      actingUserId,
      serverQueryToken,
      repoOwner: owner,
      repoName: repo,
    })

    revalidatePath(`/dashboard/${owner}/${repo}`)
    return { success: true, removed: result.removed, remaining: result.remaining }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
