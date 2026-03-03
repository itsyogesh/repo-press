import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { fetchAuthQuery, getGitHubToken } from "@/lib/auth-server"
import { createGitHubClient } from "@/lib/github"
import { normalizeRepoMediaPath } from "@/lib/studio/media-resolve"

export const runtime = "nodejs"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function GET(request: Request) {
  const token = await getGitHubToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")
    const rawPath = searchParams.get("path")
    const branchOverride = searchParams.get("branch")
    const explicitUserId = searchParams.get("userId") || undefined

    if (!projectId || !rawPath) {
      return NextResponse.json({ error: "Missing required query params: projectId, path" }, { status: 400 })
    }

    const actingUserId = await resolveActingUserId(explicitUserId)
    if (!actingUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const project = await convex.query(api.projects.get, { id: projectId as Id<"projects"> })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    if (project.userId !== actingUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const repoPath = normalizeRepoMediaPath(rawPath)
    const githubPath = repoPath.replace(/^\/+/, "")

    const pendingOp = await convex.query(api.mediaOps.getPendingByRepoPath, {
      projectId: project._id,
      repoPath,
    })

    if (pendingOp?.sourceType === "blob" && pendingOp.blobUrl) {
      const blobResponse = await fetchBlobContent(pendingOp.blobUrl)
      if (!blobResponse.ok) {
        if (blobResponse.status === 404) {
          return NextResponse.json({ error: "Media not found" }, { status: 404 })
        }
        return NextResponse.json({ error: "Failed to resolve staged blob media" }, { status: 502 })
      }

      const body = await blobResponse.arrayBuffer()
      return new Response(body, {
        status: 200,
        headers: buildProxyHeaders({
          contentType: blobResponse.headers.get("content-type") || pendingOp.mimeType || getContentType(githubPath),
          etag: blobResponse.headers.get("etag") || undefined,
        }),
      })
    }

    if (pendingOp?.sourceType === "githubBranch" && pendingOp.githubBranch && pendingOp.githubPath) {
      const githubFile = await fetchGitHubFileBytes({
        token,
        owner: project.repoOwner,
        repo: project.repoName,
        path: pendingOp.githubPath,
        ref: pendingOp.githubBranch,
      })
      if (!githubFile) {
        return NextResponse.json({ error: "Media not found" }, { status: 404 })
      }
      return new Response(new Uint8Array(githubFile.bytes), {
        status: 200,
        headers: buildProxyHeaders({
          contentType: pendingOp.mimeType || githubFile.contentType || getContentType(pendingOp.githubPath),
          etag: githubFile.etag,
        }),
      })
    }

    const githubFile = await fetchGitHubFileBytes({
      token,
      owner: project.repoOwner,
      repo: project.repoName,
      path: githubPath,
      ref: branchOverride || project.branch,
    })

    if (!githubFile) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 })
    }

    return new Response(new Uint8Array(githubFile.bytes), {
      status: 200,
      headers: buildProxyHeaders({
        contentType: githubFile.contentType || getContentType(githubPath),
        etag: githubFile.etag,
      }),
    })
  } catch (error) {
    console.error("[media-resolve] failed", error)
    return NextResponse.json({ error: "Failed to resolve media" }, { status: 500 })
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
      // fallback to explicit user ID for PAT sessions
    }
  }

  return explicitUserId || null
}

async function fetchBlobContent(url: string) {
  const headers: Record<string, string> = {}
  const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_API_TOKEN
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return fetch(url, { headers, cache: "no-store" })
}

async function fetchGitHubFileBytes({
  token,
  owner,
  repo,
  path,
  ref,
}: {
  token: string
  owner: string
  repo: string
  path: string
  ref: string
}): Promise<{ bytes: Buffer; contentType?: string; etag?: string } | null> {
  const octokit = createGitHubClient(token)

  try {
    const { data, headers } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    })

    if (Array.isArray(data)) {
      return null
    }

    let contentBase64 = "content" in data && typeof data.content === "string" ? data.content : ""
    if (!contentBase64 && data.sha) {
      const blob = await octokit.git.getBlob({
        owner,
        repo,
        file_sha: data.sha,
      })
      contentBase64 = blob.data.content || ""
    }

    if (!contentBase64) {
      return null
    }

    const etag = headers && typeof headers === "object" && "etag" in headers ? (headers.etag as string) : undefined

    return {
      bytes: Buffer.from(contentBase64, "base64"),
      contentType: getContentType(path),
      etag,
    }
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? error.status : undefined
    if (status === 404) return null
    throw error
  }
}

function buildProxyHeaders({ contentType, etag }: { contentType: string; etag?: string }) {
  const headers = new Headers()
  headers.set("Content-Type", contentType)
  headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300")
  headers.set("Vary", "Authorization, Cookie")
  if (etag) {
    headers.set("ETag", etag)
  }
  return headers
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
