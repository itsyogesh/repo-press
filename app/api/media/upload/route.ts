import { put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { getGitHubToken } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"

export const runtime = "nodejs"

interface UploadRequest {
  owner: string
  repo: string
  branch: string
  pathHint?: string
  fileName: string
  contentBase64: string
  storagePreference: "auto" | "blob" | "github"
}

interface UploadResponse {
  storage: "blob" | "github"
  url: string
  repoPath?: string
  sha?: string
  commitSha?: string
}

export async function POST(request: Request) {
  const token = await getGitHubToken()

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body: UploadRequest = await request.json()
    const { owner, repo, branch, pathHint, fileName, contentBase64, storagePreference } = body

    if (!owner || !repo || !branch || !fileName || !contentBase64) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Decode base64 content
    const contentBuffer = Buffer.from(contentBase64, "base64")
    const contentType = getContentType(fileName)

    // Determine storage strategy
    const useBlob = shouldUseBlob(storagePreference)
    const blobUrl = useBlob ? await uploadToBlob(fileName, contentBuffer, contentType) : null

    // Blob succeeded or we skipped it
    if (blobUrl) {
      return NextResponse.json({
        storage: "blob",
        url: blobUrl,
      } satisfies UploadResponse)
    }

    // Fallback to GitHub
    const githubResult = await uploadToGitHub(token, owner, repo, branch, pathHint, fileName, contentBase64)

    return NextResponse.json(githubResult satisfies UploadResponse)
  } catch (error) {
    console.error("Media upload error:", error)
    return NextResponse.json({ error: "Failed to upload media" }, { status: 500 })
  }
}

/** Resolve the Blob read-write token from env. Supports Vercel's standard name and legacy fallback. */
function getBlobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_API_TOKEN
}

function shouldUseBlob(preference: string): boolean {
  if (preference === "github") return false
  if (preference === "blob") return true

  // "auto" — try blob first, fallback to github
  return !!getBlobToken()
}

async function uploadToBlob(fileName: string, content: Buffer, contentType: string): Promise<string | null> {
  try {
    const blobToken = getBlobToken()

    if (!blobToken) {
      console.warn("Vercel Blob not configured (set BLOB_READ_WRITE_TOKEN), falling back to GitHub")
      return null
    }

    // Generate a unique path for the blob
    const timestamp = Date.now()
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_")
    const blobPath = `repo-press/${timestamp}-${cleanFileName}`

    const blob = await put(blobPath, content, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      token: blobToken,
    })

    return blob.url
  } catch (error) {
    console.error("Blob upload failed:", error)
    return null
  }
}

async function uploadToGitHub(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  pathHint: string | undefined,
  fileName: string,
  contentBase64: string,
): Promise<UploadResponse> {
  const octokit = createGitHubClient(token)

  // Use pathHint if provided, otherwise use default
  const baseDir = pathHint || "public/images"
  const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_")
  const filePath = baseDir ? `${baseDir}/${cleanFileName}` : cleanFileName

  const message = `Upload media: ${cleanFileName} via RepoPress`

  const result = await createOrUpdateFile({
    octokit,
    owner,
    repo,
    branch,
    path: filePath,
    message,
    contentBase64,
  })

  if (!result.content || !result.commit) {
    throw new Error("Failed to upload to GitHub")
  }

  // Build the raw URL for GitHub-hosted media
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`

  return {
    storage: "github",
    url: rawUrl,
    repoPath: filePath,
    sha: result.content.sha,
    commitSha: result.commit.sha,
  }
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

function isShaRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

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
