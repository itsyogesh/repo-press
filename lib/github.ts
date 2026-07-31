import { Octokit } from "@octokit/rest"
import type { PublishOperationDescriptor } from "@/lib/publish-plan"

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

/**
 * A GitHub read failed for a reason other than the file being absent.
 * Publish preflight must abort on this instead of treating the file as
 * missing - conflating failures with 404 silently disables conflict
 * detection and produces unflagged overwrites on the publish branch.
 */
export class GitHubReadError extends Error {
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = "GitHubReadError"
    this.cause = cause
  }
}

export type PublishFileReadResult =
  | { status: "found"; file: { content: string; sha: string; name: string; path: string } }
  | { status: "absent" }

/**
 * Typed file read for the publish path: only a 404 means the file is absent.
 * Every other outcome (server error, rate limit, directory at the path,
 * malformed response) throws GitHubReadError so publishing aborts instead of
 * proceeding on ambiguous state.
 */
export async function getFileForPublish(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<PublishFileReadResult> {
  const octokit = createGitHubClient(accessToken)
  let data: Awaited<ReturnType<typeof octokit.repos.getContent>>["data"]
  try {
    ;({ data } = await octokit.repos.getContent({ owner, repo, path, ref }))
  } catch (error: any) {
    if (error?.status === 404) {
      return { status: "absent" }
    }
    throw new GitHubReadError(
      `GitHub read failed for ${path}${ref ? ` at ${ref}` : ""} (status: ${error?.status ?? "unknown"})`,
      error,
    )
  }

  if (Array.isArray(data)) {
    throw new GitHubReadError(`GitHub read for ${path} resolved to a directory, not a file`)
  }
  if (!("sha" in data) || !data.sha) {
    throw new GitHubReadError(`GitHub read for ${path} returned no blob sha`)
  }

  let content: string
  if ("content" in data && data.content) {
    content = Buffer.from(data.content, "base64").toString("utf-8")
  } else {
    try {
      const { data: blobData } = await octokit.git.getBlob({ owner, repo, file_sha: data.sha })
      content = Buffer.from(blobData.content, "base64").toString("utf-8")
    } catch (error: any) {
      throw new GitHubReadError(`GitHub blob read failed for ${path} (status: ${error?.status ?? "unknown"})`, error)
    }
  }

  return {
    status: "found",
    file: { content, sha: data.sha, name: data.name, path: data.path },
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

const MAX_CREATE_FILE_BYTES = 2 * 1024 * 1024

/**
 * Creates a repository file only when the path is absent at the branch head.
 *
 * GitHub's Contents API interprets an omitted `sha` as create-only. The API
 * atomically rejects an existing path, including a concurrent winner; this
 * helper intentionally performs no preflight read, update retry, or ref write.
 */
export async function createFileContentIfAbsent(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message = "Create file via RepoPress",
  branch?: string,
) {
  assertRepository(owner, repo)
  assertRepositoryPath(path)
  assertCommitMessage(message)
  if (branch !== undefined) assertBranch(branch)
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > MAX_CREATE_FILE_BYTES) {
    throw new TypeError("Create-only file content exceeds byte limit")
  }

  const octokit = createGitHubClient(accessToken)
  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    ...(branch === undefined ? {} : { branch }),
  })
  return data
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
const MAX_VERIFY_TREE_ENTRIES = 100_000
const MAX_VERIFY_TREE_PATH_BYTES = 16 * 1024 * 1024

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

function ownOptionalData(object: object, key: string, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor) return undefined
  if (!("value" in descriptor)) throw new TypeError(`${label} must be an own data property`)
  return descriptor.value
}

function ownRequiredData(object: object, key: string, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !("value" in descriptor)) throw new TypeError(`${label} must be an own data property`)
  return descriptor.value
}

function validateBatchOperations(operations: readonly BatchOperation[]): BatchOperation[] {
  if (!Array.isArray(operations)) {
    throw new TypeError("Batch operations must be a non-empty bounded array")
  }
  const length = ownRequiredData(operations, "length", "Batch operations length")
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length === 0 || length > MAX_BATCH_OPERATIONS) {
    throw new TypeError("Batch operations must be a non-empty bounded array")
  }
  const paths = new Set<string>()
  const validated: BatchOperation[] = []
  let bytes = 0
  for (let index = 0; index < length; index += 1) {
    const rawOperation = ownRequiredData(operations, String(index), `Batch operation ${index}`)
    if (!rawOperation || typeof rawOperation !== "object" || Array.isArray(rawOperation)) {
      throw new TypeError("Batch operation must be an object")
    }
    const path = ownOptionalData(rawOperation, "path", "Batch operation path")
    const action = ownOptionalData(rawOperation, "action", "Batch operation action")
    const content = ownOptionalData(rawOperation, "content", "Batch operation content")
    const contentEncoding = ownOptionalData(rawOperation, "contentEncoding", "Batch operation contentEncoding")
    const blobSha = ownOptionalData(rawOperation, "blobSha", "Batch operation blobSha")
    if (typeof path !== "string") throw new TypeError("Batch operation path must be a string")
    assertRepositoryPath(path)
    const identity = path.normalize("NFC").toLocaleLowerCase("en-US")
    if (paths.has(identity)) throw new TypeError(`Duplicate batch operation path ${path}`)
    paths.add(identity)
    if (action !== "create" && action !== "update" && action !== "delete") {
      throw new TypeError("Invalid batch operation action")
    }
    if (contentEncoding !== undefined && contentEncoding !== "utf-8" && contentEncoding !== "base64") {
      throw new TypeError("Invalid batch operation content encoding")
    }
    if (content !== undefined && typeof content !== "string") {
      throw new TypeError("Batch operation content must be a string")
    }
    if (action === "delete") {
      if (content !== undefined || blobSha !== undefined)
        throw new TypeError("Delete operation must not contain content")
    } else if (blobSha !== undefined) {
      if (typeof blobSha !== "string") throw new TypeError("Batch operation blob SHA must be a string")
      assertSha(blobSha)
    } else if (typeof content !== "string") {
      throw new TypeError("Create and update operations require content")
    }
    bytes +=
      typeof content === "string" ? Buffer.byteLength(content, contentEncoding === "base64" ? "base64" : "utf8") : 0
    if (bytes > MAX_BATCH_BYTES) throw new TypeError("Batch operation content exceeds byte limit")
    const operation: BatchOperation = { path, action }
    if (content !== undefined) operation.content = content
    if (contentEncoding !== undefined) operation.contentEncoding = contentEncoding
    if (blobSha !== undefined) operation.blobSha = blobSha as string
    validated.push(operation)
  }
  return validated
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

/**
 * Create a publish lane branch from an exact pinned SHA (never from a
 * re-resolved mutable ref). Restricted to `repopress/` lane names, excluding
 * the registry-install namespace.
 */
export async function createPublishBranchFromSha(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  baseSha: string,
): Promise<void> {
  assertRepository(owner, repo)
  assertBranch(branch)
  assertSha(baseSha)
  if (!branch.startsWith("repopress/") || branch.startsWith("repopress/install/"))
    throw new TypeError("Publish lanes require a repopress/ branch outside the install namespace")
  const octokit = createGitHubClient(accessToken)
  await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseSha })
}

/**
 * Typed head resolution for the publish path: absent branch reads as
 * { status: "absent" }; any other failure throws GitHubReadError so callers
 * abort instead of guessing.
 */
export async function getBranchHeadForPublish(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<{ status: "found"; sha: string } | { status: "absent" }> {
  assertRepository(owner, repo)
  assertBranch(branch)
  const octokit = createGitHubClient(accessToken)
  try {
    const { data } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` })
    assertSha(data.object.sha)
    return { status: "found", sha: data.object.sha }
  } catch (error: any) {
    if (error?.status === 404) return { status: "absent" }
    throw new GitHubReadError(`GitHub head read failed for ${branch} (status: ${error?.status ?? "unknown"})`, error)
  }
}

/**
 * Read a commit's message and parents for publish-attempt recovery. Throws
 * GitHubReadError on any failure - recovery decisions must not run on
 * ambiguous evidence.
 */
export async function getCommitDetailsForPublish(
  accessToken: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<{ message: string; parents: string[] }> {
  assertRepository(owner, repo)
  assertSha(sha)
  const octokit = createGitHubClient(accessToken)
  try {
    const { data } = await octokit.git.getCommit({ owner, repo, commit_sha: sha })
    return { message: data.message, parents: data.parents.map((parent) => parent.sha) }
  } catch (error: any) {
    throw new GitHubReadError(`GitHub commit read failed for ${sha} (status: ${error?.status ?? "unknown"})`, error)
  }
}

/** Upper bound on PR commits scanned during merged-lane recovery. GitHub's
 * list endpoint itself stops at 250. */
const MAX_PR_COMMITS_FOR_PUBLISH = 250

/**
 * List a pull request's commits (message + parents) for publish-attempt
 * recovery on a MERGED lane: the head branch may already be deleted, but the
 * merged PR's commit list survives and is exactly the set of lane commits
 * that reached the base branch. Throws GitHubReadError on any failure -
 * recovery decisions must not run on ambiguous evidence.
 */
export async function getPullRequestCommitsForPublish(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<Array<{ sha: string; message: string; parents: string[] }>> {
  assertRepository(owner, repo)
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw new TypeError("PR number must be a positive integer")
  const octokit = createGitHubClient(accessToken)
  try {
    const commits: Array<{ sha: string; message: string; parents: string[] }> = []
    for (let page = 1; commits.length < MAX_PR_COMMITS_FOR_PUBLISH; page += 1) {
      const { data } = await octokit.pulls.listCommits({ owner, repo, pull_number: prNumber, per_page: 100, page })
      for (const entry of data) {
        commits.push({
          sha: entry.sha,
          message: entry.commit.message,
          parents: entry.parents.map((parent) => parent.sha),
        })
      }
      if (data.length < 100) break
    }
    return commits.slice(0, MAX_PR_COMMITS_FOR_PUBLISH)
  } catch (error: any) {
    throw new GitHubReadError(
      `GitHub PR commit list failed for #${prNumber} (status: ${error?.status ?? "unknown"})`,
      error,
    )
  }
}

export async function deleteBranchRef(accessToken: string, owner: string, repo: string, branch: string): Promise<void> {
  assertRepository(owner, repo)
  assertBranch(branch)
  if (!branch.startsWith("repopress/install/")) throw new TypeError("Refusing to delete a non-dedicated branch")
  const octokit = createGitHubClient(accessToken)
  await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch}` })
}

export interface DedicatedBranchState {
  headSha: string
  commit: null | { sha: string; parents: readonly string[]; message: string }
}

export async function getDedicatedBranchState(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  baseSha: string,
): Promise<DedicatedBranchState | null> {
  assertRepository(owner, repo)
  assertBranch(branch)
  assertSha(baseSha)
  if (!branch.startsWith("repopress/install/")) throw new TypeError("Registry installs require a dedicated branch")
  const octokit = createGitHubClient(accessToken)
  try {
    const { data: ref } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` })
    assertSha(ref.object.sha)
    if (ref.object.sha === baseSha) return { headSha: baseSha, commit: null }
    const { data: commit } = await octokit.git.getCommit({ owner, repo, commit_sha: ref.object.sha })
    if (typeof commit.message !== "string" || Buffer.byteLength(commit.message, "utf8") > 16 * 1024) {
      throw new TypeError("Dedicated branch commit message exceeds limit")
    }
    const parents = commit.parents.map((parent) => {
      assertSha(parent.sha)
      return parent.sha
    })
    if (parents.length > 16) throw new TypeError("Dedicated branch commit parent limit exceeded")
    return { headSha: ref.object.sha, commit: { sha: ref.object.sha, parents, message: commit.message } }
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null
    throw error
  }
}

export interface ExistingPullRequest {
  number: number
  htmlUrl: string
}

export async function findOpenPullRequestByHead(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  baseBranch: string,
  expectedHeadSha: string,
): Promise<ExistingPullRequest | null> {
  assertRepository(owner, repo)
  assertBranch(branch)
  assertBranch(baseBranch)
  assertSha(expectedHeadSha)
  if (!branch.startsWith("repopress/install/") || branch === baseBranch) {
    throw new TypeError("Pull request lookup requires a dedicated branch")
  }
  const octokit = createGitHubClient(accessToken)
  const { data } = await octokit.pulls.list({
    owner,
    repo,
    state: "open",
    head: `${owner}:${branch}`,
    base: baseBranch,
    per_page: 10,
  })
  const matches = data.filter(
    (pull) =>
      pull.state === "open" &&
      pull.head.ref === branch &&
      pull.head.sha === expectedHeadSha &&
      pull.base.ref === baseBranch &&
      pull.head.repo?.owner.login === owner &&
      pull.head.repo?.name === repo,
  )
  if (matches.length > 1) throw new Error("Multiple open pull requests match the dedicated branch")
  const pull = matches[0]
  return pull ? { number: pull.number, htmlUrl: pull.html_url } : null
}

export interface ExpectedBranchHead {
  branch: string
  protectedBaseBranch: string
  expectedHeadSha: string
}

function validateExpectedBranchHead(expected: ExpectedBranchHead): ExpectedBranchHead {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    throw new TypeError("Expected branch head must be an object")
  }
  const branch = ownRequiredData(expected, "branch", "Expected branch")
  const protectedBaseBranch = ownRequiredData(expected, "protectedBaseBranch", "Protected base branch")
  const expectedHeadSha = ownRequiredData(expected, "expectedHeadSha", "Expected head SHA")
  if (typeof branch !== "string" || typeof protectedBaseBranch !== "string" || typeof expectedHeadSha !== "string") {
    throw new TypeError("Expected branch head fields must be strings")
  }
  return { branch, protectedBaseBranch, expectedHeadSha }
}

/**
 * The expected-head compare-and-swap commit failed because the branch head
 * moved between planning and committing. No commit was created; callers can
 * safely re-plan against the new head and retry.
 */
export class BranchHeadMovedError extends Error {
  constructor(branch: string) {
    super(`Branch ${branch} head changed since the publish was planned`)
    this.name = "BranchHeadMovedError"
  }
}

function assertExpectedHeadPreconditions(expected: ExpectedBranchHead) {
  assertBranch(expected.branch)
  assertBranch(expected.protectedBaseBranch)
  assertSha(expected.expectedHeadSha)
  if (expected.branch === expected.protectedBaseBranch)
    throw new TypeError("Refusing to mutate the protected base branch")
}

/**
 * Expected-head CAS commit for RepoPress publish lanes (`repopress/<scope>`
 * branches created by the publish flow). Same compare-and-swap semantics as
 * the registry-install variant: the commit's parent is exactly
 * `expectedHeadSha` and the ref update is non-forced, so a branch that moved
 * after planning fails with BranchHeadMovedError instead of overwriting.
 */
export async function batchCommitPublishLaneAtExpectedHead(
  accessToken: string,
  owner: string,
  repo: string,
  rawExpected: ExpectedBranchHead,
  rawOperations: readonly BatchOperation[],
  message: string,
): Promise<{ commitSha: string; treeSha: string }> {
  assertRepository(owner, repo)
  const expected = validateExpectedBranchHead(rawExpected)
  assertExpectedHeadPreconditions(expected)
  if (!expected.branch.startsWith("repopress/") || expected.branch.startsWith("repopress/install/"))
    throw new TypeError("Publish commits require a repopress/ publish lane branch")
  return commitBatchAtValidatedHead(accessToken, owner, repo, expected, rawOperations, message)
}

export async function batchCommitAtExpectedHead(
  accessToken: string,
  owner: string,
  repo: string,
  rawExpected: ExpectedBranchHead,
  rawOperations: readonly BatchOperation[],
  message: string,
): Promise<{ commitSha: string; treeSha: string }> {
  assertRepository(owner, repo)
  const expected = validateExpectedBranchHead(rawExpected)
  assertExpectedHeadPreconditions(expected)
  if (!expected.branch.startsWith("repopress/install/"))
    throw new TypeError("Registry installs require a dedicated branch")
  return commitBatchAtValidatedHead(accessToken, owner, repo, expected, rawOperations, message)
}

async function commitBatchAtValidatedHead(
  accessToken: string,
  owner: string,
  repo: string,
  expected: ExpectedBranchHead,
  rawOperations: readonly BatchOperation[],
  message: string,
): Promise<{ commitSha: string; treeSha: string }> {
  assertCommitMessage(message)
  const operations = validateBatchOperations(rawOperations)
  const octokit = createGitHubClient(accessToken)
  const { data: branchRef } = await octokit.git.getRef({ owner, repo, ref: `heads/${expected.branch}` })
  if (branchRef.object.sha !== expected.expectedHeadSha) throw new BranchHeadMovedError(expected.branch)
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
  try {
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${expected.branch}`,
      sha: newCommit.sha,
      force: false,
    })
  } catch (error: any) {
    // A 422 on a non-forced ref update is USUALLY a fast-forward failure,
    // but 422 is also GitHub's generic validation status. Confirm the head
    // actually moved before normalizing to the typed CAS error; when the
    // head is still at the expected SHA (or the confirmation read fails),
    // surface the original error - it is not proof of a conflict.
    if (error?.status === 422) {
      try {
        const { data: confirmRef } = await octokit.git.getRef({ owner, repo, ref: `heads/${expected.branch}` })
        if (confirmRef.object.sha !== expected.expectedHeadSha) {
          throw new BranchHeadMovedError(expected.branch)
        }
      } catch (confirmError) {
        if (confirmError instanceof BranchHeadMovedError) throw confirmError
      }
    }
    throw error
  }
  return { commitSha: newCommit.sha, treeSha: newTree.sha }
}

type GitLeaf = Readonly<{ mode: string; type: string; sha: string }>

function ownData(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !("value" in descriptor)) throw new TypeError(`Git tree ${key} must be an own data property`)
  return descriptor.value
}

function indexGitLeaves(data: unknown): Map<string, GitLeaf> | null {
  try {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null
    if (ownData(data, "truncated") !== false) return null
    const rawTree = ownData(data, "tree")
    if (!Array.isArray(rawTree) || rawTree.length > MAX_VERIFY_TREE_ENTRIES) return null
    const leaves = new Map<string, GitLeaf>()
    let pathBytes = 0
    for (let index = 0; index < rawTree.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(rawTree, String(index))
      if (!descriptor || !("value" in descriptor)) return null
      const entry = descriptor.value
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null
      const path = ownData(entry, "path")
      const type = ownData(entry, "type")
      const mode = ownData(entry, "mode")
      const sha = ownData(entry, "sha")
      if (typeof path !== "string" || typeof type !== "string" || typeof mode !== "string" || typeof sha !== "string")
        return null
      assertRepositoryPath(path)
      assertSha(sha)
      pathBytes += Buffer.byteLength(path, "utf8")
      if (pathBytes > MAX_VERIFY_TREE_PATH_BYTES || !/^[0-7]{6}$/u.test(mode)) return null
      if (type === "tree") continue
      if ((type !== "blob" && type !== "commit") || leaves.has(path)) return null
      leaves.set(path, { mode, type, sha })
    }
    return leaves
  } catch {
    return null
  }
}

function validatePublishOperationDescriptors(
  rawDescriptors: readonly PublishOperationDescriptor[],
): PublishOperationDescriptor[] {
  if (!Array.isArray(rawDescriptors) || rawDescriptors.length === 0 || rawDescriptors.length > MAX_BATCH_OPERATIONS) {
    throw new TypeError("Publish descriptors must be a non-empty bounded array")
  }
  const paths = new Set<string>()
  return rawDescriptors.map((rawDescriptor, index) => {
    if (!rawDescriptor || typeof rawDescriptor !== "object" || Array.isArray(rawDescriptor)) {
      throw new TypeError(`Publish descriptor ${index} must be an object`)
    }
    const path = ownData(rawDescriptor, "path")
    const action = ownData(rawDescriptor, "action")
    if (typeof path !== "string") throw new TypeError("Publish descriptor path must be a string")
    assertRepositoryPath(path)
    if (path !== path.normalize("NFC")) throw new TypeError("Publish descriptor path must be canonical")
    if (paths.has(path)) throw new TypeError(`Duplicate publish descriptor path ${path}`)
    paths.add(path)
    if (action === "delete") {
      if (Object.hasOwn(rawDescriptor, "expectedBlobSha")) {
        throw new TypeError("Delete publish descriptor must not contain a blob SHA")
      }
      return { path, action }
    }
    if (action !== "create" && action !== "update") throw new TypeError("Invalid publish descriptor action")
    const expectedBlobSha = ownData(rawDescriptor, "expectedBlobSha")
    if (typeof expectedBlobSha !== "string") throw new TypeError("Publish descriptor blob SHA must be a string")
    assertSha(expectedBlobSha)
    return { path, action, expectedBlobSha }
  })
}

async function readGitLeavesForPublish(
  octokit: ReturnType<typeof createGitHubClient>,
  owner: string,
  repo: string,
  sha: string,
): Promise<Map<string, GitLeaf>> {
  try {
    const { data } = await octokit.git.getTree({ owner, repo, tree_sha: sha, recursive: "1" })
    const leaves = indexGitLeaves(data)
    if (!leaves) throw new GitHubReadError(`GitHub returned a truncated or malformed tree for ${sha}`)
    return leaves
  } catch (error: any) {
    if (error instanceof GitHubReadError) throw error
    throw new GitHubReadError(`GitHub tree read failed for ${sha} (status: ${error?.status ?? "unknown"})`, error)
  }
}

function applyPublishDescriptors(
  baseLeaves: Map<string, GitLeaf>,
  descriptors: readonly PublishOperationDescriptor[],
): Map<string, GitLeaf> {
  const expected = new Map(baseLeaves)
  for (const descriptor of descriptors) {
    if (descriptor.action === "delete") expected.delete(descriptor.path)
    else {
      expected.set(descriptor.path, {
        mode: "100644",
        type: "blob",
        sha: descriptor.expectedBlobSha,
      })
    }
  }
  return expected
}

function gitLeavesEqual(expected: Map<string, GitLeaf>, actual: Map<string, GitLeaf>): boolean {
  if (expected.size !== actual.size) return false
  for (const [path, leaf] of expected) {
    const candidate = actual.get(path)
    if (!candidate || candidate.mode !== leaf.mode || candidate.type !== leaf.type || candidate.sha !== leaf.sha) {
      return false
    }
  }
  return true
}

/**
 * Prove that a candidate is exactly the CAS commit described by a durable
 * publish attempt: it must directly parent the planned head and its complete
 * tree must equal that head's tree with only the described changes applied.
 */
export async function verifyPublishAttemptCommitForPublish(
  accessToken: string,
  owner: string,
  repo: string,
  expectedHeadSha: string,
  candidateSha: string,
  rawDescriptors: readonly PublishOperationDescriptor[],
): Promise<boolean> {
  assertRepository(owner, repo)
  assertSha(expectedHeadSha)
  assertSha(candidateSha)
  const descriptors = validatePublishOperationDescriptors(rawDescriptors)
  const octokit = createGitHubClient(accessToken)
  try {
    const { data } = await octokit.git.getCommit({ owner, repo, commit_sha: candidateSha })
    if (!Array.isArray(data.parents)) throw new GitHubReadError(`GitHub returned malformed parents for ${candidateSha}`)
    const parents = data.parents.map((parent) => {
      if (!parent || typeof parent.sha !== "string") {
        throw new GitHubReadError(`GitHub returned malformed parents for ${candidateSha}`)
      }
      assertSha(parent.sha)
      return parent.sha
    })
    if (parents.length !== 1 || parents[0] !== expectedHeadSha) return false
  } catch (error: any) {
    if (error instanceof GitHubReadError) throw error
    throw new GitHubReadError(
      `GitHub commit read failed for ${candidateSha} (status: ${error?.status ?? "unknown"})`,
      error,
    )
  }
  const [baseLeaves, candidateLeaves] = await Promise.all([
    readGitLeavesForPublish(octokit, owner, repo, expectedHeadSha),
    readGitLeavesForPublish(octokit, owner, repo, candidateSha),
  ])
  return gitLeavesEqual(applyPublishDescriptors(baseLeaves, descriptors), candidateLeaves)
}

export type PublishPathOutcome = {
  path: string
  disposition: "finalize" | "restore"
  finalBlobSha?: string
}

/** Inspect how each attempted path exists at an immutable final authority. */
export async function inspectPublishEffectsAtCommit(
  accessToken: string,
  owner: string,
  repo: string,
  authoritySha: string,
  rawDescriptors: readonly PublishOperationDescriptor[],
): Promise<PublishPathOutcome[]> {
  assertRepository(owner, repo)
  assertSha(authoritySha)
  const descriptors = validatePublishOperationDescriptors(rawDescriptors)
  const leaves = await readGitLeavesForPublish(createGitHubClient(accessToken), owner, repo, authoritySha)
  return descriptors.map((descriptor) => {
    const finalLeaf = leaves.get(descriptor.path)
    const finalBlobSha = finalLeaf?.type === "blob" ? finalLeaf.sha : undefined
    const disposition =
      descriptor.action === "delete"
        ? finalLeaf === undefined
          ? "finalize"
          : "restore"
        : finalLeaf?.type === "blob" && finalLeaf.mode === "100644" && finalLeaf.sha === descriptor.expectedBlobSha
          ? "finalize"
          : "restore"
    return { path: descriptor.path, disposition, ...(finalBlobSha ? { finalBlobSha } : {}) }
  })
}

function operationBytes(operation: BatchOperation): Buffer | null {
  if (operation.blobSha) return null
  const content = operation.content as string
  if (operation.contentEncoding !== "base64") return Buffer.from(content, "utf8")
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(content)) return null
  const bytes = Buffer.from(content, "base64")
  return bytes.toString("base64") === content ? bytes : null
}

async function gitBlobSha(bytes: Buffer): Promise<string> {
  const prefix = new TextEncoder().encode(`blob ${bytes.byteLength}\0`)
  const input = new Uint8Array(prefix.byteLength + bytes.byteLength)
  input.set(prefix)
  input.set(bytes, prefix.byteLength)
  const digest = await globalThis.crypto.subtle.digest("SHA-1", input)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function verifyBatchCommitTree(
  accessToken: string,
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
  rawOperations: readonly BatchOperation[],
): Promise<boolean> {
  assertRepository(owner, repo)
  assertSha(baseSha)
  assertSha(headSha)
  if (baseSha === headSha) return false
  const operations = validateBatchOperations(rawOperations)
  const octokit = createGitHubClient(accessToken)
  const [{ data: baseTree }, { data: headTree }] = await Promise.all([
    octokit.git.getTree({ owner, repo, tree_sha: baseSha, recursive: "1" }),
    octokit.git.getTree({ owner, repo, tree_sha: headSha, recursive: "1" }),
  ])
  const expected = indexGitLeaves(baseTree)
  const actual = indexGitLeaves(headTree)
  if (!expected || !actual) return false
  for (const operation of operations) {
    const exists = expected.has(operation.path)
    if (operation.action === "create" && exists) return false
    if ((operation.action === "update" || operation.action === "delete") && !exists) return false
    if (operation.action === "delete") {
      expected.delete(operation.path)
      continue
    }
    let sha: string
    if (operation.blobSha) sha = operation.blobSha
    else {
      const bytes = operationBytes(operation)
      if (!bytes) return false
      sha = await gitBlobSha(bytes)
    }
    expected.set(operation.path, { mode: "100644", type: "blob", sha })
  }
  if (expected.size !== actual.size) return false
  for (const [path, leaf] of expected) {
    const candidate = actual.get(path)
    if (!candidate || candidate.mode !== leaf.mode || candidate.type !== leaf.type || candidate.sha !== leaf.sha)
      return false
  }
  return true
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

/**
 * Look up an existing open pull request for a publish lane (head = lane
 * branch, base = the protected base branch). Used to make PR creation an
 * idempotent ensure: after an uncertain createPullRequest outcome, adopt the
 * PR that actually exists instead of guessing. Throws GitHubReadError on any
 * lookup failure so callers keep the uncertainty explicit.
 */
export async function findOpenPublishLanePullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  baseBranch: string,
): Promise<{ number: number; htmlUrl: string } | null> {
  assertRepository(owner, repo)
  assertBranch(branch)
  assertBranch(baseBranch)
  if (!branch.startsWith("repopress/") || branch.startsWith("repopress/install/") || branch === baseBranch) {
    throw new TypeError("Publish lane PR lookup requires a repopress/ lane branch")
  }
  const octokit = createGitHubClient(accessToken)
  try {
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state: "open",
      head: `${owner}:${branch}`,
      base: baseBranch,
      per_page: 2,
    })
    const pr = data[0]
    if (!pr) return null
    return { number: pr.number, htmlUrl: pr.html_url }
  } catch (error: any) {
    throw new GitHubReadError(`GitHub PR lookup failed for ${branch} (status: ${error?.status ?? "unknown"})`, error)
  }
}

export async function createPullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body?: string,
): Promise<{
  number: number
  url: string
  htmlUrl: string
  headSha: string
  headRef: string
  headRepoFullName: string
  baseRef: string
}> {
  const octokit = createGitHubClient(accessToken)
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    head,
    base,
    title,
    body,
  })
  return {
    number: data.number,
    url: data.url,
    htmlUrl: data.html_url,
    headSha: data.head.sha,
    headRef: data.head.ref,
    headRepoFullName: data.head.repo?.full_name ?? "",
    baseRef: data.base.ref,
  }
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
