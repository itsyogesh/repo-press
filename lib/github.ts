import { Octokit } from "@octokit/rest"

export type GitHubFile = {
  name: string
  path: string
  sha: string
  type: "file" | "dir"
  download_url: string | null
}

export type GitHubRepo = {
  id: number
  name: string
  full_name: string
  private: boolean
  html_url: string
  description: string | null
  fork: boolean
  url: string
  created_at: string
  updated_at: string
  pushed_at: string
  homepage: string | null
  size: number
  stargazers_count: number
  watchers_count: number
  language: string | null
  forks_count: number
  open_issues_count: number
  master_branch?: string
  default_branch: string
  score?: number
  owner: {
    login: string
    id: number
    avatar_url: string
    url: string
  }
}

export function createGitHubClient(accessToken: string) {
  const sanitizedToken = accessToken.replace(/[^\x20-\x7E]/g, "").trim()
  return new Octokit({
    auth: sanitizedToken,
  })
}

export async function getUserRepos(accessToken: string): Promise<GitHubRepo[]> {
  const octokit = createGitHubClient(accessToken)
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 100,
  })
  return data
}

export async function getRepoBranches(accessToken: string, owner: string, repo: string) {
  const octokit = createGitHubClient(accessToken)
  const { data } = await octokit.repos.listBranches({
    owner,
    repo,
  })
  return data
}

export async function getRepoContents(accessToken: string, owner: string, repo: string, path = "", ref?: string) {
  const octokit = createGitHubClient(accessToken)
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    })

    if (Array.isArray(data)) {
      return data as GitHubFile[]
    }
    return [data] as GitHubFile[]
  } catch (error) {
    console.error("Error fetching repo contents:", error)
    return []
  }
}

export async function getFileContent(accessToken: string, owner: string, repo: string, path: string, ref?: string) {
  const octokit = createGitHubClient(accessToken)
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    })

    if (!Array.isArray(data) && "content" in data && typeof data.content === "string") {
      return Buffer.from(data.content, "base64").toString("utf-8")
    }

    console.log("[v0] getFileContent: Data is array or missing content", Array.isArray(data), data)
    return null
  } catch (error) {
    console.error("Error fetching file content:", error)
    return null
  }
}

export async function getFile(accessToken: string, owner: string, repo: string, path: string, ref?: string) {
  const octokit = createGitHubClient(accessToken)
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    })

    if (Array.isArray(data)) {
      console.log("[v0] getFile: Path is a directory", path)
      return null
    }

    let content = ""
    if ("content" in data && data.content) {
      content = Buffer.from(data.content, "base64").toString("utf-8")
    } else if (data.sha) {
      console.log("[v0] getFile: Content missing, fetching blob", data.sha)
      const { data: blobData } = await octokit.git.getBlob({
        owner,
        repo,
        file_sha: data.sha,
      })
      content = Buffer.from(blobData.content, "base64").toString("utf-8")
    } else {
      console.log("[v0] getFile: No content or sha found")
      return null
    }

    return {
      content,
      sha: data.sha,
      name: data.name,
      path: data.path,
    }
  } catch (error) {
    console.error("Error fetching file:", error)
    return null
  }
}

export async function saveFileContent(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha?: string,
  message = "Update file via RepoPress",
  branch?: string,
) {
  const octokit = createGitHubClient(accessToken)
  try {
    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString("base64"),
      sha,
      branch,
    })
    return data
  } catch (error) {
    console.error("Error saving file:", error)
    throw error
  }
}
