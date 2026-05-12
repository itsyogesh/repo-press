"use server"

import { revalidatePath } from "next/cache"
import { getGitHubToken } from "@/lib/auth-server"
import { batchCommit } from "@/lib/github"
import { resolveRepoRole } from "@/lib/github-permissions"
import { resolveActingUserId } from "@/lib/server-context"

function buildInitialRepoPressConfig(
  branch: string,
  projectConfig: {
    id: string
    name: string
    contentRoot: string
    framework: string
    contentType: string
  },
) {
  return {
    version: 1,
    defaults: {
      branch,
      framework: "auto",
    },
    projects: [
      {
        ...projectConfig,
        branch,
      },
    ],
  }
}

export async function initRepoPressAction(
  owner: string,
  repo: string,
  branch: string,
  projectConfig: {
    id: string
    name: string
    contentRoot: string
    framework: string
    contentType: string
  },
) {
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

  const config = buildInitialRepoPressConfig(branch, projectConfig)

  try {
    // Commit the manifest only. Native runtime detection handles previewing by default.
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
