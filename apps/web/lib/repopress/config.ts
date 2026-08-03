import { getFile } from "@/lib/github"
import { type RepoPressConfig, repoPressConfigSchema } from "../config-schema"

export type ConfigErrorType = "not-found" | "invalid" | "fetch-failed"

export interface FetchConfigResult {
  config: RepoPressConfig | null
  error: string | null
  errorType: ConfigErrorType | null
  sha: string | null
}

export async function fetchRepoConfig(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<FetchConfigResult> {
  try {
    const fileResult = await getFile(token, owner, repo, "repopress.config.json", branch)

    if (!fileResult) {
      return {
        config: null,
        error: "repopress.config.json not found",
        errorType: "not-found",
        sha: null,
      }
    }

    const { content, sha } = fileResult

    if (!content) {
      return {
        config: null,
        error: "repopress.config.json is empty",
        errorType: "invalid",
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
        errorType: "invalid",
        sha,
      }
    }

    const validated = repoPressConfigSchema.safeParse(parsedJson)
    if (!validated.success) {
      const errorStr = validated.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")
      return { config: null, error: `Invalid config schema: ${errorStr}`, errorType: "invalid", sha }
    }

    return { config: validated.data, error: null, errorType: null, sha }
  } catch (error: any) {
    if (error.status === 404) {
      return {
        config: null,
        error: "repopress.config.json not found",
        errorType: "not-found",
        sha: null,
      }
    }
    return {
      config: null,
      error: `GitHub API error: ${error.message}`,
      errorType: "fetch-failed",
      sha: null,
    }
  }
}
