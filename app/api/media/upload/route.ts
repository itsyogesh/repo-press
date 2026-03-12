import { put } from "@vercel/blob"
import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { createGitHubClient } from "@/lib/github"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { RouteAuthError, getContentType as sharedGetContentType, resolveRouteAuth } from "@/lib/route-auth"
import { buildMediaResolveUrl, normalizeRepoMediaPath } from "@/lib/studio/media-resolve"

export const runtime = "nodejs"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

type StoragePreference = "auto" | "blob" | "github"

// Fix #3: Maximum upload size — 50MB (base64 string is ~33% larger than binary)
const MAX_UPLOAD_BASE64_LENGTH = Math.ceil(50 * 1024 * 1024 * (4 / 3))

interface UploadRequest {
  projectId?: string
  owner: string
  repo: string
  branch: string
  pathHint?: string
  fileName: string
  contentBase64: string
  storagePreference?: StoragePreference
}

interface UploadResponse {
  storage: "blob" | "github"
  repoPath: string
  previewUrl: string
  staged: true
  mediaOpId: string
  url: string
  diagnostics?: Record<string, string>
}

interface BlobUploadResult {
  url: string
  access: "public" | "private"
}

interface GitHubUploadResult {
  sha?: string
  commitSha?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UploadRequest
    const { projectId, owner, repo, branch, pathHint, fileName, contentBase64, storagePreference = "auto" } = body

    if (!owner || !repo || !branch || !fileName || !contentBase64) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Fix #3: Validate upload size before decoding base64 to prevent OOM
    if (contentBase64.length > MAX_UPLOAD_BASE64_LENGTH) {
      return NextResponse.json({ error: "Upload exceeds maximum file size of 50MB" }, { status: 413 })
    }

    const project = await resolveProject({ projectId, owner, repo, branch })
    if (!project) {
      return NextResponse.json({ error: "Project not found. Pass a valid projectId for uploads." }, { status: 404 })
    }

    let auth: Awaited<ReturnType<typeof resolveRouteAuth>>
    try {
      auth = await resolveRouteAuth(project, "editor")
    } catch (e) {
      if (e instanceof RouteAuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      throw e
    }
    const { actingUserId: convexUserId, projectAccessToken, githubToken: token } = auth

    if (project.repoOwner !== owner || project.repoName !== repo || project.branch !== branch) {
      return NextResponse.json(
        {
          error:
            "Upload repo context does not match project settings. Refresh Studio and retry with the active project branch.",
        },
        { status: 400 },
      )
    }

    const repoPath = buildRepoPath(pathHint, fileName)
    const githubPath = repoPath.replace(/^\/+/, "")
    const contentBuffer = Buffer.from(contentBase64, "base64")
    const contentType = getContentType(fileName)
    const sizeBytes = contentBuffer.byteLength

    // Capture base-branch SHA at staging time for later publish conflict detection.
    const baseShaAtStage = await getExistingFileShaSafe(token, owner, repo, githubPath, project.branch)

    if (shouldTryBlob(storagePreference)) {
      const blobResult = await uploadToBlobWithRetry({
        owner: project.repoOwner,
        repo: project.repoName,
        githubPath,
        content: contentBuffer,
        contentType,
      })

      if (blobResult.ok) {
        const mediaOpId = await convex.mutation(api.mediaOps.stage, {
          projectId: project._id,
          userId: convexUserId,
          projectAccessToken,
          repoPath,
          fileName: sanitizeFileName(fileName),
          mimeType: contentType,
          sizeBytes,
          sourceType: "blob",
          blobUrl: blobResult.value.url,
          blobAccess: blobResult.value.access,
          githubSha: baseShaAtStage ?? undefined,
        })

        const previewUrl = buildMediaResolveUrl(project._id, repoPath)
        return NextResponse.json({
          storage: "blob",
          repoPath,
          previewUrl,
          staged: true,
          mediaOpId,
          url: previewUrl,
          diagnostics: blobResult.diagnostics,
        } satisfies UploadResponse)
      }

      if (storagePreference === "blob") {
        return NextResponse.json(
          {
            error: blobResult.error || "Blob upload failed",
            diagnostics: blobResult.diagnostics,
          },
          { status: 502 },
        )
      }
    }

    const activePublishBranch = await convex.query(api.publishBranches.getActiveForProject, {
      projectId: project._id,
      userId: convexUserId,
      projectAccessToken,
    })

    if (!activePublishBranch?.branchName) {
      return NextResponse.json(
        {
          error:
            "Blob upload fallback requires an active publish branch. Start a publish draft first, then retry upload.",
        },
        { status: 409 },
      )
    }

    const githubUpload = await uploadToGitHub({
      token,
      owner: project.repoOwner,
      repo: project.repoName,
      branch: activePublishBranch.branchName,
      path: githubPath,
      fileName,
      contentBase64,
    })

    const mediaOpId = await convex.mutation(api.mediaOps.stage, {
      projectId: project._id,
      userId: convexUserId,
      projectAccessToken,
      repoPath,
      fileName: sanitizeFileName(fileName),
      mimeType: contentType,
      sizeBytes,
      sourceType: "githubBranch",
      githubBranch: activePublishBranch.branchName,
      githubPath,
      githubSha: baseShaAtStage ?? undefined,
    })

    const previewUrl = buildMediaResolveUrl(project._id, repoPath)
    return NextResponse.json({
      storage: "github",
      repoPath,
      previewUrl,
      staged: true,
      mediaOpId,
      url: previewUrl,
      diagnostics: {
        fallback: "githubBranch",
        githubUploadSha: githubUpload.sha || "",
        githubCommitSha: githubUpload.commitSha || "",
      },
    } satisfies UploadResponse)
  } catch (error) {
    console.error("[media-upload] failed", error)
    return NextResponse.json({ error: "Failed to upload media" }, { status: 500 })
  }
}

async function resolveProject({
  projectId,
  owner,
  repo,
  branch,
}: {
  projectId?: string
  owner: string
  repo: string
  branch: string
}) {
  const serverQueryToken = await mintServerQueryToken()

  if (projectId) {
    return await convex.query(api.projects.get, {
      id: projectId as Id<"projects">,
      serverQueryToken,
    })
  }

  // Without a projectId, find by repo metadata using the server-side findByRepo query
  const project = await convex.query(api.projects.findByRepo, {
    repoOwner: owner,
    repoName: repo,
    branch,
    serverQueryToken,
  })
  return project || null
}

function shouldTryBlob(preference: StoragePreference): boolean {
  if (preference === "github") return false
  return true
}

function getBlobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_API_TOKEN
}

function buildRepoPath(pathHint: string | undefined, fileName: string): string {
  const safeName = sanitizeFileName(fileName)
  const cleanHint = (pathHint || "public/images").trim().replace(/^\/+/, "").replace(/\/+$/, "")
  const combined = cleanHint ? `${cleanHint}/${safeName}` : safeName
  return normalizeRepoMediaPath(combined)
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
}

async function uploadToBlobWithRetry({
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

async function uploadToGitHub({
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

/**
 * Fix #10: Match specific Vercel Blob access-mode mismatch errors only.
 * Previously matched any error containing "public" or "access", which could
 * mask unrelated errors like "Cannot access property of undefined".
 */
function isBlobAccessMismatch(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  // Match Vercel Blob's specific error about public/private access mode mismatch
  return (
    message.includes("public access is not allowed") ||
    message.includes("access mode") ||
    (message.includes("public") && message.includes("not allowed"))
  )
}

function isShaRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false

  const maybeStatus = "status" in error ? error.status : undefined
  const maybeMessage = "message" in error ? error.message : undefined
  return maybeStatus === 422 && typeof maybeMessage === "string" && maybeMessage.toLowerCase().includes("sha")
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

async function getExistingFileShaSafe(
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

function getContentType(fileName: string): string {
  return sharedGetContentType(fileName)
}
