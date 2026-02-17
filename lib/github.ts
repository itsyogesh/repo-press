import { Octokit } from "@octokit/rest"

export type GitHubFile = {
  name: string
  path: string
  sha: string
  type: "file" | "dir"
  download_url: string | null
}

export type FileTreeNode = {
  name: string
  path: string
  sha: string
  type: "file" | "dir"
  children?: FileTreeNode[]
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
  created_at: string | null
  updated_at: string | null
  pushed_at: string | null
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
    per_page: 100,
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

const CONTENT_EXTENSIONS = [".md", ".mdx", ".markdown"]

/**
 * Fetch a recursive file tree scoped to contentRoot, filtered to content files only.
 * Uses the Git Trees API (single request) instead of per-directory Contents API.
 */
export async function getContentTree(
  accessToken: string,
  owner: string,
  repo: string,
  ref = "main",
  contentRoot = "",
): Promise<FileTreeNode[]> {
  const octokit = createGitHubClient(accessToken)
  try {
    const { data } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: ref,
      recursive: "1",
    })

    // Filter tree to content files within contentRoot
    const prefix = contentRoot ? contentRoot + "/" : ""
    const contentFiles = new Set<string>()
    const contentDirs = new Set<string>()

    for (const item of data.tree) {
      if (!item.path || !item.sha) continue

      // Must be within contentRoot
      if (prefix && !item.path.startsWith(prefix)) continue

      if (item.type === "blob" && CONTENT_EXTENSIONS.some((ext) => item.path!.endsWith(ext))) {
        // Relative path from contentRoot
        const relPath = prefix ? item.path.slice(prefix.length) : item.path
        contentFiles.add(relPath)

        // Track all ancestor dirs so we include them
        const parts = relPath.split("/")
        for (let i = 1; i < parts.length; i++) {
          contentDirs.add(parts.slice(0, i).join("/"))
        }
      }
    }

    // Build nested tree from flat paths
    const root: FileTreeNode[] = []
    const dirMap = new Map<string, FileTreeNode>()

    // Create directory nodes
    const sortedDirs = Array.from(contentDirs).sort()
    for (const dirPath of sortedDirs) {
      const name = dirPath.split("/").pop()!
      const treeItem = data.tree.find((t) => t.path === (prefix ? prefix + dirPath : dirPath) && t.type === "tree")
      const node: FileTreeNode = {
        name,
        path: prefix ? prefix + dirPath : dirPath,
        sha: treeItem?.sha || "",
        type: "dir",
        children: [],
      }
      dirMap.set(dirPath, node)

      const parentPath = dirPath.split("/").slice(0, -1).join("/")
      if (parentPath && dirMap.has(parentPath)) {
        dirMap.get(parentPath)!.children!.push(node)
      } else {
        root.push(node)
      }
    }

    // Create file nodes
    const sortedFiles = Array.from(contentFiles).sort()
    for (const filePath of sortedFiles) {
      const name = filePath.split("/").pop()!
      const treeItem = data.tree.find((t) => t.path === (prefix ? prefix + filePath : filePath) && t.type === "blob")
      const node: FileTreeNode = {
        name,
        path: prefix ? prefix + filePath : filePath,
        sha: treeItem?.sha || "",
        type: "file",
      }

      const parentPath = filePath.split("/").slice(0, -1).join("/")
      if (parentPath && dirMap.has(parentPath)) {
        dirMap.get(parentPath)!.children!.push(node)
      } else {
        root.push(node)
      }
    }

    // Sort each directory's children: dirs first, then files, alphabetically
    function sortChildren(nodes: FileTreeNode[]) {
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      for (const node of nodes) {
        if (node.children) sortChildren(node.children)
      }
    }
    sortChildren(root)

    return root
  } catch (error) {
    console.error("Error fetching content tree:", error)
    return []
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
