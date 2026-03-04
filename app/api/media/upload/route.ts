import { put } from "@vercel/blob"
import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { fetchAuthQuery, getGitHubToken } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"
import { buildMediaResolveUrl, normalizeRepoMediaPath } from "@/lib/studio/media-resolve"

export const runtime = "nodejs"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

type StoragePreference = "auto" | "blob" | "github"

interface UploadRequest {
  projectId?: string
  userId?: string
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
  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = (await request.json()) as UploadRequest
    const {
      projectId,
      userId,
      owner,
      repo,
      branch,
      pathHint,
      fileName,
      contentBase64,
      storagePreference = "auto",
    } = body

    if (!owner || !repo || !branch || !fileName || !contentBase64) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const actingUserId = await resolveActingUserId(userId)
    if (!actingUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const project = await resolveProject({ projectId, owner, repo, branch, userId: actingUserId })
    if (!project) {
      return NextResponse.json({ error: "Project not found. Pass a valid projectId for uploads." }, { status: 404 })
    }

    if (project.userId !== actingUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

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
          userId: actingUserId,
          repoPath,
          fileName: sanitizeFileName(fileName),
          mimeType: contentType,
          sizeBytes,
          sourceType: "blob",
          blobUrl: blobResult.value.url,
          blobAccess: blobResult.value.access,
          githubSha: baseShaAtStage ?? undefined,
        })

        const previewUrl = buildMediaResolveUrl(project._id, repoPath, actingUserId)
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
      userId: actingUserId,
      repoPath,
      fileName: sanitizeFileName(fileName),
      mimeType: contentType,
      sizeBytes,
      sourceType: "githubBranch",
      githubBranch: activePublishBranch.branchName,
      githubPath,
      githubSha: baseShaAtStage ?? undefined,
    })

    const previewUrl = buildMediaResolveUrl(project._id, repoPath, actingUserId)
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

async function resolveActingUserId(explicitUserId?: string): Promise<string | null> {
  if (fetchAuthQuery) {
    try {
      const authUser = await fetchAuthQuery(api.auth.getCurrentUser)
      if (authUser?._id) {
        return authUser._id as string
      }
    } catch {
      // fallback to explicit user ID for PAT-driven sessions
    }
  }

  return explicitUserId || null
}

async function resolveProject({
  projectId,
  owner,
  repo,
  branch,
  userId,
}: {
  projectId?: string
  owner: string
  repo: string
  branch: string
  userId: string
}) {
  if (projectId) {
    return await convex.query(api.projects.get, {
      id: projectId as Id<"projects">,
    })
  }

  const byRepo = await convex.query(api.projects.getByRepo, {
    userId,
    repoOwner: owner,
    repoName: repo,
  })

  if (!byRepo || byRepo.length === 0) {
    return null
  }

  const exact = byRepo.find((project) => project.branch === branch)
  return exact || byRepo[0]
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

function isBlobAccessMismatch(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes("public") || message.includes("access")
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
  const ext = fileName.toLowerCase().split(".").pop()
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    webm: "video/webm",
    mp4: "video/mp4",
    pdf: "application/pdf",
  }
  return types[ext || ""] || "application/octet-stream"
}
