import { put } from "@vercel/blob"
import sharp from "sharp"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { createGitHubClient } from "@/lib/github"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { getContentType as sharedGetContentType } from "@/lib/route-auth"
import { normalizeRepoMediaPath } from "@/lib/studio/media-resolve"

export type BlobUploadResult = {
  url: string
  access: "public" | "private"
}

export type GitHubUploadResult = {
  sha?: string
  commitSha?: string
}

export type ConvexStorageUploadResult = {
  storageId: string
}

type ConvexMutationClient = {
  mutation: (ref: unknown, args: Record<string, unknown>) => Promise<unknown>
}

export type ImageMetadata = {
  width?: number
  height?: number
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
}

export function buildRepoPath(pathHint: string | undefined, fileName: string): string {
  const safeName = sanitizeFileName(fileName)
  const cleanHint = (pathHint || "public/images").trim().replace(/^\/+/, "").replace(/\/+$/, "")
  const combined = cleanHint ? `${cleanHint}/${safeName}` : safeName
  return normalizeRepoMediaPath(combined)
}

export function getBlobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_API_TOKEN
}

export function isBlobAccessMismatch(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("public access is not allowed") ||
    message.includes("does not allow public") ||
    message.includes("public uploads") ||
    message.includes("access mode") ||
    (message.includes("public") &&
      (message.includes("not allowed") || message.includes("does not allow") || message.includes("denied")))
  )
}

/**
 * Upload bytes to Convex file storage.
 * Returns a storageId that can be used with ctx.storage.getUrl() for preview
 * and must be deleted via ctx.storage.delete() when no longer needed.
 */
export async function uploadToConvexStorage({
  convex,
  api,
  projectId,
  userId,
  projectAccessToken,
  content,
  contentType,
}: {
  convex: ConvexMutationClient
  api: { mediaOps: { generateConvexUploadUrl: unknown } }
  projectId: Id<"projects">
  userId?: string
  projectAccessToken?: string
  content: Buffer
  contentType: string
}): Promise<ConvexStorageUploadResult> {
  const uploadUrl = (await convex.mutation(api.mediaOps.generateConvexUploadUrl, {
    projectId,
    userId,
    projectAccessToken,
  })) as string

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: content,
    headers: { "Content-Type": contentType },
  })

  if (!response.ok) {
    throw new Error(`Convex storage upload failed: ${response.status} ${response.statusText}`)
  }

  const result = (await response.json()) as { storageId: string }
  return { storageId: result.storageId }
}

export async function uploadToBlobWithRetry({
  owner,
  repo,
  githubPath,
  content,
  contentType,
}: {
  owner: string
  repo: string
  githubPath: string
  content: Buffer
  contentType: string
}): Promise<
  | { ok: true; value: BlobUploadResult; diagnostics?: Record<string, string> }
  | { ok: false; error: string; diagnostics?: Record<string, string> }
> {
  const blobToken = getBlobToken()
  if (!blobToken) {
    return {
      ok: false,
      error: "Blob token missing",
      diagnostics: { blob: "token-missing" },
    }
  }

  const blobPath = `repo-press/${owner}/${repo}/${githubPath}`

  try {
    const blob = await put(blobPath, content, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      token: blobToken,
    })
    return {
      ok: true,
      value: { url: blob.url, access: "public" },
    }
  } catch (error) {
    if (!isBlobAccessMismatch(error)) {
      return {
        ok: false,
        error: "Blob upload failed",
        diagnostics: { blob: "public-upload-failed" },
      }
    }
  }

  try {
    const blob = await put(blobPath, content, {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      token: blobToken,
    })
    return {
      ok: true,
      value: { url: blob.url, access: "private" },
      diagnostics: { blob: "retried-private" },
    }
  } catch {
    return {
      ok: false,
      error: "Blob upload failed",
      diagnostics: { blob: "private-upload-failed" },
    }
  }
}

export async function getImageMetadata(content: Buffer): Promise<ImageMetadata> {
  try {
    const metadata = await sharp(content).metadata()
    return {
      width: typeof metadata.width === "number" ? metadata.width : undefined,
      height: typeof metadata.height === "number" ? metadata.height : undefined,
    }
  } catch {
    return {}
  }
}

export async function recordMediaAsset({
  convex,
  api,
  projectId,
  userId,
  projectAccessToken,
  fileName,
  filePath,
  mimeType,
  sizeBytes,
  githubSha,
  originalUrl,
  metadata,
}: {
  convex: ConvexMutationClient
  api: { mediaAssets: { upsert: unknown } }
  projectId: Id<"projects">
  userId?: string
  projectAccessToken?: string
  fileName: string
  filePath: string
  mimeType?: string
  sizeBytes?: number
  githubSha?: string
  originalUrl?: string
  metadata?: ImageMetadata
}) {
  await convex.mutation(api.mediaAssets.upsert, {
    projectId,
    userId,
    projectAccessToken,
    fileName: sanitizeFileName(fileName),
    filePath,
    mimeType,
    sizeBytes,
    githubSha,
    originalUrl,
    width: metadata?.width,
    height: metadata?.height,
  })
}

function isShaRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false

  const maybeStatus = "status" in error ? error.status : undefined
  const maybeMessage = "message" in error ? error.message : undefined
  return maybeStatus === 422 && typeof maybeMessage === "string" && maybeMessage.toLowerCase().includes("sha")
}

async function getExistingFileSha(
  octokit: ReturnType<typeof createGitHubClient>,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string | null> {
  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path,
    ref: branch,
  })

  if (!data || Array.isArray(data) || typeof data !== "object" || !("sha" in data) || typeof data.sha !== "string") {
    return null
  }

  return data.sha
}

async function createOrUpdateFile({
  octokit,
  owner,
  repo,
  branch,
  path,
  message,
  contentBase64,
}: {
  octokit: ReturnType<typeof createGitHubClient>
  owner: string
  repo: string
  branch: string
  path: string
  message: string
  contentBase64: string
}) {
  try {
    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: contentBase64,
      branch,
    })
    return data
  } catch (error) {
    if (!isShaRequiredError(error)) {
      throw error
    }

    const sha = await getExistingFileSha(octokit, owner, repo, path, branch)
    if (!sha) {
      throw error
    }

    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: contentBase64,
      branch,
      sha,
    })
    return data
  }
}

export async function uploadToGitHub({
  token,
  owner,
  repo,
  branch,
  path,
  fileName,
  contentBase64,
}: {
  token: string
  owner: string
  repo: string
  branch: string
  path: string
  fileName: string
  contentBase64: string
}): Promise<GitHubUploadResult> {
  const octokit = createGitHubClient(token)
  const message = `Upload media: ${sanitizeFileName(fileName)} via RepoPress`

  const result = await createOrUpdateFile({
    octokit,
    owner,
    repo,
    branch,
    path,
    message,
    contentBase64,
  })

  return {
    sha: result.content?.sha,
    commitSha: result.commit?.sha,
  }
}

export async function getExistingFileShaSafe(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string | null> {
  try {
    return await getExistingFileSha(createGitHubClient(token), owner, repo, path, branch)
  } catch {
    return null
  }
}

export function getContentType(fileName: string): string {
  return sharedGetContentType(fileName)
}

export async function resolveProject({
  convex,
  api,
  projectId,
  owner,
  repo,
  branch,
}: {
  convex: { query: (ref: unknown, args: Record<string, unknown>) => Promise<unknown> }
  api: { projects: { get: unknown; findByRepo: unknown } }
  projectId?: string
  owner: string
  repo: string
  branch: string
}): Promise<Doc<"projects"> | null> {
  const serverQueryToken = await mintServerQueryToken()

  if (projectId) {
    return (await convex.query(api.projects.get, {
      id: projectId as Id<"projects">,
      serverQueryToken,
    })) as Doc<"projects"> | null
  }

  const project = await convex.query(api.projects.findByRepo, {
    repoOwner: owner,
    repoName: repo,
    branch,
    serverQueryToken,
  })
  return (project as Doc<"projects"> | null) || null
}
