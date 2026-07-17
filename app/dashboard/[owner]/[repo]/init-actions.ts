"use server"

import { revalidatePath } from "next/cache"
import { getGitHubToken } from "@/lib/auth-server"
import { repoPressConfigSchema } from "@/lib/config-schema"
import { batchCommit } from "@/lib/github"
import { resolveRepoRole } from "@/lib/github-permissions"
import { resolveActingUserId } from "@/lib/server-context"

type InitialProjectConfig = {
  id: string
  name: string
  contentRoot: string
  framework: string
  contentType: string
}

function readOwnDataField(projectConfig: unknown, field: keyof InitialProjectConfig): unknown {
  if (!projectConfig || typeof projectConfig !== "object") {
    throw new TypeError("Project configuration must be an object")
  }
  const descriptor = Object.getOwnPropertyDescriptor(projectConfig, field)
  if (!descriptor || !("value" in descriptor)) {
    throw new TypeError(`Project configuration field "${field}" must be an own data property`)
  }
  return descriptor.value
}

function buildInitialConfig(branch: string, projectConfig: unknown) {
  return repoPressConfigSchema.parse({
    version: 1,
    defaults: {
      branch,
      framework: "auto",
    },
    projects: [
      {
        id: readOwnDataField(projectConfig, "id"),
        name: readOwnDataField(projectConfig, "name"),
        contentRoot: readOwnDataField(projectConfig, "contentRoot"),
        framework: readOwnDataField(projectConfig, "framework"),
        contentType: readOwnDataField(projectConfig, "contentType"),
        branch,
      },
    ],
  })
}

export async function initRepoPressAction(
  owner: string,
  repo: string,
  branch: string,
  projectConfig: InitialProjectConfig,
) {
  let config: ReturnType<typeof buildInitialConfig>
  try {
    config = buildInitialConfig(branch, projectConfig)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid project configuration",
    }
  }

  const token = await getGitHubToken()
  if (!token) return { success: false, error: "Not authenticated" }

  // Resolve acting user for cache lookup
  const actingUserId = await resolveActingUserId(token)

  // Access check: verify the user can at least read the repo.
  // We don't pre-block "viewer" role because org editors with a cold cache
  // are downgraded to "viewer" by the content probe. Instead, we let
  // batchCommit attempt the write - GitHub's API is the final authority.
  const { role: resolvedRole } = await resolveRepoRole(token, owner, repo, actingUserId)
  if (!resolvedRole) {
    return { success: false, error: "No access to this repository" }
  }

  try {
    // New projects use repository-native discovery. Explicit preview entries
    // remain a backward-compatible opt-in, but setup never fabricates one.
    await batchCommit(
      token,
      owner,
      repo,
      branch,
      [
        {
          path: "repopress.config.json",
          content: JSON.stringify(config, null, 2),
          action: "create",
        },
      ],
      "chore: initialize RepoPress configuration",
    )

    revalidatePath(`/dashboard/${owner}/${repo}/setup`)
    return { success: true }
  } catch (error: any) {
    console.error("Failed to init RepoPress:", error)
    return { success: false, error: error.message }
  }
}
