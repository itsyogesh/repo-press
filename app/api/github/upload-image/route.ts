import { NextResponse } from "next/server"
import { getGitHubToken } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"

const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"])
const ALLOWED_UPLOAD_PREFIXES = ["public/images/", "static/images/", "images/", "assets/images/", "src/assets/images/"]
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  const token = await getGitHubToken()

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { owner, repo, path, content, sha, message, branch } = body

    if (!owner || !repo || !path || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const normalizedPath = normalizeUploadPath(path)
    if (!normalizedPath) {
      return NextResponse.json({ error: "Invalid image path" }, { status: 400 })
    }

    if (!hasAllowedImageExtension(normalizedPath)) {
      return NextResponse.json({ error: "Only image uploads are supported" }, { status: 400 })
    }

    const decodedSize = getDecodedBase64Size(content)
    if (decodedSize > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: "Image upload exceeds the 10MB limit" }, { status: 413 })
    }

    // content is already base64 encoded from the client.
    // Use Octokit directly to avoid double-encoding through saveFileContent.
    const octokit = createGitHubClient(token)
    const { data: result } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: normalizedPath,
      message: message || `Upload image via RepoPress`,
      content,
      sha,
      branch,
    })

    if (!result.content || !result.commit) {
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 })
    }

    return NextResponse.json({
      path: normalizedPath,
      sha: result.content.sha,
      commitSha: result.commit.sha,
      url: result.content.html_url,
    })
  } catch (error) {
    console.error("Error uploading image:", error)
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 })
  }
}

function normalizeUploadPath(path: string): string | null {
  const normalized = path.trim().replace(/\\/g, "/").replace(/^\/+/, "")
  if (!normalized) return null

  const segments = normalized.split("/").filter(Boolean)
  if (segments.length === 0) return null
  if (segments.some((segment) => segment === "." || segment === "..")) return null

  const joined = segments.join("/")
  const isAllowed = ALLOWED_UPLOAD_PREFIXES.some((prefix) => joined.startsWith(prefix))
  return isAllowed ? joined : null
}

function hasAllowedImageExtension(path: string): boolean {
  const lowerPath = path.toLowerCase()
  return Array.from(ALLOWED_IMAGE_EXTENSIONS).some((ext) => lowerPath.endsWith(ext))
}

function getDecodedBase64Size(content: string): number {
  return Buffer.byteLength(content.replace(/\s+/g, ""), "base64")
}
