import { type ProjectConfigInput, type RepoPressConfig, repoPressConfigSchema } from "@/lib/config-schema"
import { saveFileContent } from "@/lib/github"
import { type FetchConfigResult, fetchRepoConfig } from "./config"
import { assertJson } from "./registry-schema"

// ── Types ─────────────────────────────────────────────────────────

export type ConfigWriteResult =
  | { success: true; config: RepoPressConfig; sha: string }
  | { success: false; error: string; errorType: "fetch-failed" | "validation" | "commit-failed" | "conflict" }

export type NewProjectDef = Omit<ProjectConfigInput, "preview" | "components"> & {
  /** Optional compatibility override; new setup does not synthesize one. */
  preview?: ProjectConfigInput["preview"]
  /** Declarative authoring hints only; never executable preview authority. */
  components?: ProjectConfigInput["components"]
}

// ── Pure helpers (no side effects, testable) ──────────────────────

/**
 * Adds a project to an existing config without generating preview adapters or
 * component catalogs. Explicit compatibility metadata is preserved only when
 * the caller supplies it. Returns the updated config or throws if validation
 * fails (e.g. duplicate id or contentRoot).
 */
export function addProject(config: RepoPressConfig, project: NewProjectDef): RepoPressConfig {
  assertJson(config)
  if (config.projects.some((p) => p.id === project.id)) {
    throw new Error(`Project with id "${project.id}" already exists in config`)
  }
  if (config.projects.some((p) => p.contentRoot === project.contentRoot && p.branch === project.branch)) {
    throw new Error(
      `A project with contentRoot "${project.contentRoot}" on branch "${project.branch ?? "default"}" already exists`,
    )
  }

  const updated = {
    ...config,
    projects: [...config.projects, project],
  }
  // Validate with Zod before returning
  return repoPressConfigSchema.parse(updated)
}

/**
 * Updates properties of an existing project. `contentRoot` and `id` are
 * immutable - attempting to change them throws.
 */
export function updateProject(
  config: RepoPressConfig,
  configProjectId: string,
  updates: Partial<
    Pick<ProjectConfigInput, "name" | "framework" | "contentType" | "branch" | "preview" | "components">
  >,
): RepoPressConfig {
  assertJson(config)
  const idx = config.projects.findIndex((p) => p.id === configProjectId)
  if (idx === -1) {
    throw new Error(`Project "${configProjectId}" not found in config`)
  }

  const updated = {
    ...config,
    projects: config.projects.map((p, i) => (i === idx ? { ...p, ...updates } : p)),
  }
  return repoPressConfigSchema.parse(updated)
}

/**
 * Removes a project from the config. Removing the last project produces
 * a valid config with an empty projects array - callers should then delete
 * the config file rather than committing an empty list.
 */
export function removeProject(config: RepoPressConfig, configProjectId: string): RepoPressConfig {
  assertJson(config)
  const filtered = config.projects.filter((p) => p.id !== configProjectId)
  if (filtered.length === config.projects.length) {
    throw new Error(`Project "${configProjectId}" not found in config`)
  }

  const updated: RepoPressConfig = { ...config, projects: filtered }
  return repoPressConfigSchema.parse(updated)
}

// ── GitHub I/O ────────────────────────────────────────────────────

/**
 * Reads the current repopress.config.json from GitHub.
 * Thin wrapper around fetchRepoConfig that normalizes the result.
 */
export async function readConfig(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<FetchConfigResult> {
  return fetchRepoConfig(token, owner, repo, branch)
}

/**
 * Commits a validated config to GitHub via `saveFileContent`.
 * Uses the provided SHA for optimistic locking (409 on conflict).
 */
export async function commitConfig(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  config: RepoPressConfig,
  sha: string,
  message: string,
): Promise<{ sha: string }> {
  const content = JSON.stringify(config, null, 2)
  const result = await saveFileContent(token, owner, repo, "repopress.config.json", content, sha, message, branch)
  return { sha: result?.content?.sha ?? sha }
}
