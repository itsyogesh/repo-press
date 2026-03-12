import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { createGitHubClient } from "@/lib/github"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"
import { normalizeRepoMediaPath } from "@/lib/studio/media-resolve"

export const runtime = "nodejs"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")
    const rawPath = searchParams.get("path")
    const branchOverride = searchParams.get("branch")

    if (!projectId || !rawPath) {
      return NextResponse.json({ error: "Missing required query params: projectId, path" }, { status: 400 })
    }

    const serverQueryToken = await mintServerQueryToken()
    const project = await convex.query(api.projects.get, {
      id: projectId as Id<"projects">,
      serverQueryToken,
    })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Check GitHub permissions (read-only route — viewer is sufficient)
    let auth: Awaited<ReturnType<typeof resolveRouteAuth>>
    try {
      auth = await resolveRouteAuth(project, "viewer")
    } catch (e) {
      if (e instanceof RouteAuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      throw e
    }
    const { actingUserId, projectAccessToken, githubToken: token } = auth
    const queryAuth = { userId: actingUserId, projectAccessToken }

    const repoPath = normalizeRepoMediaPath(rawPath)
    const githubPath = repoPath.replace(/^\/+/, "")
    const githubPathCandidates = getGitHubPathCandidates(githubPath)

    const pendingOp = await convex.query(api.mediaOps.getPendingByRepoPath, {
      projectId: project._id,
      repoPath,
      ...queryAuth,
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

    const activePublishBranch = await convex.query(api.publishBranches.getActiveForProject, {
      projectId: project._id,
      ...queryAuth,
    })
    const refsToTry = Array.from(
      new Set([branchOverride, activePublishBranch?.branchName, project.branch].filter((ref): ref is string => !!ref)),
    )

    let githubFile: {
      bytes: Buffer
      contentType?: string
      etag?: string
    } | null = null
    let resolvedGitHubPath = githubPath
    for (const ref of refsToTry) {
      for (const candidatePath of githubPathCandidates) {
        githubFile = await fetchGitHubFileBytes({
          token,
          owner: project.repoOwner,
          repo: project.repoName,
          path: candidatePath,
          ref,
        })
        if (githubFile) {
          resolvedGitHubPath = candidatePath
          break
        }
      }
      if (githubFile) break
    }

    if (!githubFile) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 })
    }

    return new Response(new Uint8Array(githubFile.bytes), {
      status: 200,
      headers: buildProxyHeaders({
        contentType: githubFile.contentType || getContentType(resolvedGitHubPath),
        etag: githubFile.etag,
      }),
    })
  } catch (error) {
    console.error("[media-resolve] failed", error)
    return NextResponse.json({ error: "Failed to resolve media" }, { status: 500 })
  }
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

function getGitHubPathCandidates(path: string): string[] {
  const normalized = path.replace(/^\/+/, "")
  if (!normalized) return [normalized]

  const candidates = new Set<string>([normalized])
  if (!normalized.startsWith("public/") && normalized.startsWith("images/")) {
    candidates.add(`public/${normalized}`)
  }

  return Array.from(candidates)
}
