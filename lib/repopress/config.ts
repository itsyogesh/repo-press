import { getFile } from "@/lib/github"
import { repoPressConfigSchema, RepoPressConfig } from "../config-schema"

export async function fetchRepoConfig(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<{
  config: RepoPressConfig | null
  error: string | null
  sha: string | null
}> {
  try {
    const fileResult = await getFile(token, owner, repo, "repopress.config.json", branch)

    if (!fileResult) {
      return {
        config: null,
        error: "repopress.config.json not found",
        sha: null,
      }
    }

    const { content, sha } = fileResult

    if (!content) {
      return {
        config: null,
        error: "repopress.config.json is empty",
        sha: null,
      }
    }

    let parsedJson: any
    try {
      parsedJson = JSON.parse(content)
    } catch (err: any) {
      return {
        config: null,
        error: `Invalid JSON format: ${err.message}`,
        sha,
      }
    }

    const validated = repoPressConfigSchema.safeParse(parsedJson)
    if (!validated.success) {
      const errorStr = validated.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")
      return { config: null, error: `Invalid config schema: ${errorStr}`, sha }
    }

    return { config: validated.data, error: null, sha }
  } catch (error: any) {
    if (error.status === 404) {
      return {
        config: null,
        error: "repopress.config.json not found",
        sha: null,
      }
    }
    return {
      config: null,
      error: `GitHub API error: ${error.message}`,
      sha: null,
    }
  }
}
