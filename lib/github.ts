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

/** Recursively find a node by its full path in a tree of nodes with `path` and optional `children` fields. */
export function findTreeNode<T extends { path: string; children?: T[] }>(nodes: T[], path: string): T | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children) {
      const found = findTreeNode(node.children, path)
      if (found) return found
    }
  }
  return null
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
  } catch (error: any) {
    if (error.status === 404) {
      return null
    }
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
    const prefix = contentRoot ? `${contentRoot}/` : ""
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

export async function deleteFileContent(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  sha: string,
  message = "Delete file via RepoPress",
  branch?: string,
) {
  const octokit = createGitHubClient(accessToken)
  const { data } = await octokit.repos.deleteFile({
    owner,
    repo,
    path,
    message,
    sha,
    branch,
  })
  return data
}

export async function createBranch(
  accessToken: string,
  owner: string,
  repo: string,
  baseBranch: string,
  newBranch: string,
) {
  const octokit = createGitHubClient(accessToken)
  // Get the SHA of the base branch
  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  })
  // Create the new branch
  const { data } = await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${newBranch}`,
    sha: ref.object.sha,
  })
  return data
}

export async function branchExists(accessToken: string, owner: string, repo: string, branchName: string) {
  const octokit = createGitHubClient(accessToken)

  try {
    await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    })
    return true
  } catch (error: any) {
    if (error?.status === 404) {
      return false
    }
    throw error
  }
}

export type BatchOperation = {
  path: string
  content?: string
  contentEncoding?: "utf-8" | "base64"
  blobSha?: string
  action: "create" | "update" | "delete"
}

const GITHUB_SHA = /^[a-f0-9]{40}$/u
const GITHUB_REPOSITORY_PART = /^[A-Za-z0-9_.-]{1,100}$/u
const GITHUB_BRANCH = /^[A-Za-z0-9._/-]{1,200}$/u
const MAX_BATCH_OPERATIONS = 2_048
const MAX_BATCH_BYTES = 32 * 1024 * 1024
const MAX_SNAPSHOT_FILES = 2_048
const MAX_SNAPSHOT_FILE_BYTES = 2 * 1024 * 1024
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024

function assertRepository(owner: string, repo: string): void {
  if (!GITHUB_REPOSITORY_PART.test(owner) || !GITHUB_REPOSITORY_PART.test(repo)) {
    throw new TypeError("Invalid GitHub repository coordinates")
  }
}

function assertBranch(branch: string): void {
  if (
    !GITHUB_BRANCH.test(branch) ||
    branch.startsWith(".") ||
    branch.startsWith("/") ||
    branch.endsWith(".") ||
    branch.endsWith("/") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{")
  )
    throw new TypeError("Invalid GitHub branch")
}

function assertSha(sha: string): void {
  if (!GITHUB_SHA.test(sha)) throw new TypeError("Invalid GitHub commit SHA")
}

function hasControlOrBidi(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x61c ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    )
      return true
  }
  return false
}

function assertRepositoryPath(path: string): void {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    Buffer.byteLength(path, "utf8") > 4_096 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    hasControlOrBidi(path) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new TypeError("Invalid repository path")
  }
}

function validateBatchOperations(operations: readonly BatchOperation[]): BatchOperation[] {
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > MAX_BATCH_OPERATIONS) {
    throw new TypeError("Batch operations must be a non-empty bounded array")
  }
  const paths = new Set<string>()
  let bytes = 0
  return operations.map((operation) => {
    assertRepositoryPath(operation.path)
    const identity = operation.path.normalize("NFC").toLocaleLowerCase("en-US")
    if (paths.has(identity)) throw new TypeError(`Duplicate batch operation path ${operation.path}`)
    paths.add(identity)
    if (operation.action !== "create" && operation.action !== "update" && operation.action !== "delete") {
      throw new TypeError("Invalid batch operation action")
    }
    if (operation.action === "delete") {
      if (operation.content !== undefined || operation.blobSha !== undefined)
        throw new TypeError("Delete operation must not contain content")
    } else if (operation.blobSha) {
      assertSha(operation.blobSha)
    } else if (typeof operation.content !== "string") {
      throw new TypeError("Create and update operations require content")
    }
    bytes += operation.content
      ? Buffer.byteLength(operation.content, operation.contentEncoding === "base64" ? "base64" : "utf8")
      : 0
    if (bytes > MAX_BATCH_BYTES) throw new TypeError("Batch operation content exceeds byte limit")
    return { ...operation }
  })
}

function assertCommitMessage(message: string): void {
  if (typeof message !== "string" || message.length === 0 || Buffer.byteLength(message, "utf8") > 4_096) {
    throw new TypeError("Invalid Git commit message")
  }
  if (
    [...message].some((character) => {
      const code = character.codePointAt(0) ?? 0
      return (code < 0x20 && character !== "\n" && character !== "\t") || code === 0x7f
    })
  )
    throw new TypeError("Git commit message contains control characters")
}

export async function getBranchHeadSha(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  assertRepository(owner, repo)
  assertBranch(branch)
  const octokit = createGitHubClient(accessToken)
  const { data } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` })
  assertSha(data.object.sha)
  return data.object.sha
}

export async function createBranchFromSha(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  baseSha: string,
): Promise<void> {
  assertRepository(owner, repo)
  assertBranch(branch)
  assertSha(baseSha)
  if (!branch.startsWith("repopress/install/")) throw new TypeError("Registry installs require a dedicated branch")
  const octokit = createGitHubClient(accessToken)
  await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseSha })
}

export async function deleteBranchRef(accessToken: string, owner: string, repo: string, branch: string): Promise<void> {
  assertRepository(owner, repo)
  assertBranch(branch)
  if (!branch.startsWith("repopress/install/")) throw new TypeError("Refusing to delete a non-dedicated branch")
  const octokit = createGitHubClient(accessToken)
  await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch}` })
}

export interface ExpectedBranchHead {
  branch: string
  protectedBaseBranch: string
  expectedHeadSha: string
}

export async function batchCommitAtExpectedHead(
  accessToken: string,
  owner: string,
  repo: string,
  expected: ExpectedBranchHead,
  rawOperations: readonly BatchOperation[],
  message: string,
): Promise<{ commitSha: string; treeSha: string }> {
  assertRepository(owner, repo)
  assertBranch(expected.branch)
  assertBranch(expected.protectedBaseBranch)
  assertSha(expected.expectedHeadSha)
  if (expected.branch === expected.protectedBaseBranch)
    throw new TypeError("Refusing to mutate the protected base branch")
  if (!expected.branch.startsWith("repopress/install/"))
    throw new TypeError("Registry installs require a dedicated branch")
  assertCommitMessage(message)
  const operations = validateBatchOperations(rawOperations)
  const octokit = createGitHubClient(accessToken)
  const { data: branchRef } = await octokit.git.getRef({ owner, repo, ref: `heads/${expected.branch}` })
  if (branchRef.object.sha !== expected.expectedHeadSha) throw new Error("Dedicated branch head changed")
  const { data: baseCommit } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: expected.expectedHeadSha,
  })
  const tree = await Promise.all(
    operations.map(async (operation) => {
      if (operation.action === "delete") {
        return { path: operation.path, mode: "100644" as const, type: "blob" as const, sha: null }
      }
      if (operation.blobSha) {
        return { path: operation.path, mode: "100644" as const, type: "blob" as const, sha: operation.blobSha }
      }
      if (operation.contentEncoding === "base64") {
        const { data: blob } = await octokit.git.createBlob({
          owner,
          repo,
          content: operation.content as string,
          encoding: "base64",
        })
        return { path: operation.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha }
      }
      return {
        path: operation.path,
        mode: "100644" as const,
        type: "blob" as const,
        content: operation.content as string,
      }
    }),
  )
  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree,
  })
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [expected.expectedHeadSha],
  })
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${expected.branch}`,
    sha: newCommit.sha,
    force: false,
  })
  return { commitSha: newCommit.sha, treeSha: newTree.sha }
}

export interface GitHubTextFileSnapshot {
  path: string
  content: string
}

export async function getTextFilesAtCommit(
  accessToken: string,
  owner: string,
  repo: string,
  commitSha: string,
  rawPaths: readonly string[],
): Promise<GitHubTextFileSnapshot[]> {
  assertRepository(owner, repo)
  assertSha(commitSha)
  if (!Array.isArray(rawPaths) || rawPaths.length > MAX_SNAPSHOT_FILES)
    throw new TypeError("Repository snapshot path limit exceeded")
  const paths = [...new Set(rawPaths)].sort()
  for (const path of paths) assertRepositoryPath(path)
  const octokit = createGitHubClient(accessToken)
  let totalBytes = 0
  const snapshots: GitHubTextFileSnapshot[] = []
  for (const path of paths) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path, ref: commitSha })
      if (Array.isArray(data)) throw new TypeError(`Repository snapshot path is a directory: ${path}`)
      let bytes: Buffer
      if ("content" in data && typeof data.content === "string" && data.content.length > 0) {
        bytes = Buffer.from(data.content, "base64")
      } else {
        const { data: blob } = await octokit.git.getBlob({ owner, repo, file_sha: data.sha })
        bytes = Buffer.from(blob.content, "base64")
      }
      if (bytes.byteLength > MAX_SNAPSHOT_FILE_BYTES) throw new TypeError(`Repository snapshot file too large: ${path}`)
      totalBytes += bytes.byteLength
      if (totalBytes > MAX_SNAPSHOT_BYTES) throw new TypeError("Repository snapshot byte limit exceeded")
      snapshots.push({ path, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) })
    } catch (error) {
      if ((error as { status?: number }).status === 404) continue
      throw error
    }
  }
  return snapshots
}

export async function batchCommit(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  operations: BatchOperation[],
  message: string,
): Promise<{ commitSha: string; treeSha: string }> {
  const octokit = createGitHubClient(accessToken)

  // 1. Get the current commit SHA for the branch
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  })
  const baseSha = refData.object.sha

  // 2. Get the base tree
  const { data: baseCommit } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha,
  })

  // 3. Build tree entries
  const treeEntries = await Promise.all(
    operations.map(async (op) => {
      if (op.action === "delete") {
        return {
          path: op.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: null,
        }
      }

      if (op.blobSha) {
        return {
          path: op.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: op.blobSha,
        }
      }

      if (op.contentEncoding === "base64") {
        const { data: blob } = await octokit.git.createBlob({
          owner,
          repo,
          content: op.content || "",
          encoding: "base64",
        })

        return {
          path: op.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.sha,
        }
      }

      return {
        path: op.path,
        mode: "100644" as const,
        type: "blob" as const,
        content: op.content || "",
      }
    }),
  )

  // 4. Create a new tree
  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tree: treeEntries as any,
  })

  // 5. Create a new commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [baseSha],
  })

  // 6. Update the branch reference
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  })

  return { commitSha: newCommit.sha, treeSha: newTree.sha }
}

export async function createPullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body?: string,
): Promise<{ number: number; url: string; htmlUrl: string }> {
  const octokit = createGitHubClient(accessToken)
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    head,
    base,
    title,
    body,
  })
  return { number: data.number, url: data.url, htmlUrl: data.html_url }
}

export async function updatePullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  pullNumber: number,
  updates: { title?: string; body?: string },
): Promise<void> {
  const octokit = createGitHubClient(accessToken)
  await octokit.pulls.update({
    owner,
    repo,
    pull_number: pullNumber,
    ...updates,
  })
}

export async function getPullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<{ state: string; merged: boolean; mergeCommitSha: string | null }> {
  const octokit = createGitHubClient(accessToken)
  const { data } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  })
  return {
    state: data.state,
    merged: data.merged,
    mergeCommitSha: data.merge_commit_sha,
  }
}

export function getCommitUrl(owner: string, repo: string, sha: string): string {
  return `https://github.com/${owner}/${repo}/commit/${sha}`
}

export function getFileAtCommitUrl(owner: string, repo: string, path: string, sha: string): string {
  return `https://github.com/${owner}/${repo}/blob/${sha}/${path}`
}
