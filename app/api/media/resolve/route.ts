import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { createGitHubClient } from "@/lib/github"
import { getContentType } from "@/lib/media/content-type"
import { mintServerQueryToken, verifyProjectAccessToken } from "@/lib/project-access-token"
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
    const queryAccessToken = searchParams.get("projectAccessToken")

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

    // Attempt auth via projectAccessToken query param first (for <img> tag requests)
    let actingUserId: string | null = null
    let projectAccessToken: string | null = null
    let githubToken: string | null = null

    if (queryAccessToken) {
      try {
        const payload = await verifyProjectAccessToken(queryAccessToken)
        if (payload?.userId && payload?.projectId === projectId) {
          actingUserId = payload.userId
          projectAccessToken = queryAccessToken
          // githubToken is not available via projectAccessToken — resolved via cookies below
        }
      } catch {
        // Token verification failed, fall back to cookie-based auth
      }
    }

    // Fallback to cookie-based auth if token auth failed or not provided,
    // or if githubToken is still null (needed for GitHub API calls below).
    if (!actingUserId || !githubToken) {
      try {
        const auth = await resolveRouteAuth(project, "viewer")
        if (!actingUserId) actingUserId = auth.actingUserId
        if (!projectAccessToken) projectAccessToken = auth.projectAccessToken
        githubToken = auth.githubToken
      } catch (e) {
        if (!actingUserId) {
          // No auth at all — reject the request
          if (e instanceof RouteAuthError) {
            return NextResponse.json({ error: e.message }, { status: e.status })
          }
          throw e
        }
        // actingUserId from projectAccessToken is valid; githubToken still null.
        // The githubToken guard below will return 401 if GitHub access is needed.
      }
    }

    if (!actingUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const queryAuth = { userId: actingUserId, projectAccessToken: projectAccessToken || undefined }

    const repoPath = normalizeRepoMediaPath(rawPath)
    const githubPath = repoPath.replace(/^\/+/, "")
    const githubPathCandidates = getGitHubPathCandidates(githubPath)

    // Look up pending op — try both /images/... and /public/images/... since
    // images are staged with the full repo path (public/) but authored/referenced
    // as the web URL path (/images/...). e.g. staged key = /public/images/blog/photo.jpg,
    // authored value = /images/blog/photo.jpg (after toPublicAssetPath strips the prefix).
    let pendingOp = await convex.query(api.mediaOps.getPendingByRepoPath, {
      projectId: project._id,
      repoPath,
      ...queryAuth,
    })
    let effectiveRepoPath = repoPath

    if (!pendingOp && repoPath.startsWith("/images/")) {
      const publicRepoPath = `/public${repoPath}`
      const altOp = await convex.query(api.mediaOps.getPendingByRepoPath, {
        projectId: project._id,
        repoPath: publicRepoPath,
        ...queryAuth,
      })
      if (altOp) {
        pendingOp = altOp
        effectiveRepoPath = publicRepoPath
      }
    }

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

    if (pendingOp?.sourceType === "convex" && pendingOp.convexStorageId) {
      const storageUrl = await convex.query(api.mediaOps.getConvexStorageUrl, {
        projectId: project._id,
        repoPath: effectiveRepoPath,
        ...queryAuth,
      })
      if (!storageUrl) {
        return NextResponse.json({ error: "Media not found" }, { status: 404 })
      }
      // Redirect to the Convex CDN URL — no need to proxy bytes through Next.js.
      return NextResponse.redirect(storageUrl, { status: 302 })
    }

    if (pendingOp?.sourceType === "githubBranch" && pendingOp.githubBranch && pendingOp.githubPath) {
      if (!githubToken) {
        return NextResponse.json({ error: "GitHub token unavailable for media access" }, { status: 401 })
      }
      const githubFile = await fetchGitHubFileBytes({
        token: githubToken,
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

    if (!githubToken) {
      return NextResponse.json({ error: "GitHub token unavailable for media access" }, { status: 401 })
    }

    for (const ref of refsToTry) {
      for (const candidatePath of githubPathCandidates) {
        githubFile = await fetchGitHubFileBytes({
          token: githubToken,
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

function getGitHubPathCandidates(path: string): string[] {
  const normalized = path.replace(/^\/+/, "")
  if (!normalized) return [normalized]

  const candidates = new Set<string>([normalized])
  if (!normalized.startsWith("public/") && normalized.startsWith("images/")) {
    candidates.add(`public/${normalized}`)
  }

  return Array.from(candidates)
}
