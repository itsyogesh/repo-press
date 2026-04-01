import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"
import { buildMediaResolveUrl } from "@/lib/studio/media-resolve"
import {
  buildRepoPath,
  getContentType,
  getExistingFileShaSafe,
  getImageMetadata,
  recordMediaAsset,
  resolveProject,
  sanitizeFileName,
  uploadToBlobWithRetry,
  uploadToGitHub,
} from "@/lib/studio/media-upload-shared"

export const runtime = "nodejs"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
const MAX_EXTERNAL_IMAGE_BYTES = 10 * 1024 * 1024

interface DownloadExternalRequest {
  projectId?: string
  owner: string
  repo: string
  branch: string
  pathHint?: string
  fileName?: string
  sourceFilePath?: string
  url: string
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    return false
  }
}

function extensionFromContentType(contentType: string): string {
  const clean = contentType.split(";")[0]?.trim().toLowerCase()
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  }
  return map[clean] || "png"
}

function deriveFileName(url: string, providedFileName: string | undefined, contentType: string): string {
  if (providedFileName?.trim()) {
    return sanitizeFileName(providedFileName.trim())
  }

  try {
    const parsed = new URL(url)
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop()
    if (lastSegment) {
      const decoded = decodeURIComponent(lastSegment)
      if (decoded.includes(".")) {
        return sanitizeFileName(decoded)
      }
      return sanitizeFileName(`${decoded}.${extensionFromContentType(contentType)}`)
    }
  } catch {
    // ignore
  }

  return `image.${extensionFromContentType(contentType)}`
}

function shouldTryBlob(preference: "auto" | "blob" | "github" = "auto"): boolean {
  if (preference === "github") return false
  return true
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DownloadExternalRequest
    const { projectId, owner, repo, branch, pathHint, fileName, sourceFilePath, url } = body

    if (!owner || !repo || !branch || !url) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!isSafeExternalUrl(url)) {
      return NextResponse.json({ error: "Invalid external image URL" }, { status: 400 })
    }

    const project = await resolveProject({ convex, api, projectId, owner, repo, branch })
    if (!project) {
      return NextResponse.json({ error: "Project not found. Pass a valid projectId for downloads." }, { status: 404 })
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
            "Download repo context does not match project settings. Refresh Studio and retry with the active project branch.",
        },
        { status: 400 },
      )
    }

    const externalResponse = await fetch(url)
    if (!externalResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch external image" }, { status: 502 })
    }

    const contentType = externalResponse.headers.get("content-type") || ""
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "External image must resolve to an image content type" }, { status: 400 })
    }

    const arrayBuffer = await externalResponse.arrayBuffer()
    const contentBuffer = Buffer.from(arrayBuffer)
    if (contentBuffer.byteLength > MAX_EXTERNAL_IMAGE_BYTES) {
      return NextResponse.json({ error: "External image exceeds maximum file size of 10MB" }, { status: 413 })
    }

    const resolvedFileName = deriveFileName(url, fileName, contentType)
    const repoPath = buildRepoPath(pathHint, resolvedFileName)
    const githubPath = repoPath.replace(/^\/+/, "")
    const contentBase64 = contentBuffer.toString("base64")
    const sizeBytes = contentBuffer.byteLength
    const imageMetadata = await getImageMetadata(contentBuffer)
    const baseShaAtStage = await getExistingFileShaSafe(token, owner, repo, githubPath, project.branch)

    let blobDiagnostics: Record<string, string> | undefined

    if (shouldTryBlob()) {
      const blobResult = await uploadToBlobWithRetry({
        owner: project.repoOwner,
        repo: project.repoName,
        githubPath,
        content: contentBuffer,
        contentType,
      })

      blobDiagnostics = blobResult.diagnostics

      if (blobResult.ok) {
        const mediaOpId = await convex.mutation(api.mediaOps.stage, {
          projectId: project._id,
          userId: convexUserId,
          projectAccessToken,
          repoPath,
          fileName: sanitizeFileName(resolvedFileName),
          mimeType: contentType || getContentType(resolvedFileName),
          sizeBytes,
          sourceFilePath,
          sourceType: "blob",
          blobUrl: blobResult.value.url,
          blobAccess: blobResult.value.access,
          githubSha: baseShaAtStage ?? undefined,
        })

        await recordMediaAsset({
          convex,
          api,
          projectId: project._id,
          userId: convexUserId,
          projectAccessToken,
          fileName: resolvedFileName,
          filePath: repoPath,
          mimeType: contentType || getContentType(resolvedFileName),
          sizeBytes,
          githubSha: baseShaAtStage ?? undefined,
          originalUrl: url,
          metadata: imageMetadata,
        })

        const previewUrl = buildMediaResolveUrl(project._id, repoPath)
        return NextResponse.json({
          storage: "blob",
          repoPath,
          previewUrl,
          staged: true,
          mediaOpId,
          url: previewUrl,
          diagnostics: blobDiagnostics,
        })
      }
    }

    const activePublishBranch = await convex.query(api.publishBranches.getActiveForProject, {
      projectId: project._id,
      userId: convexUserId,
      projectAccessToken,
    })

    if (!activePublishBranch?.branchName) {
      const isBlobTokenMissing = blobDiagnostics?.blob === "token-missing"
      return NextResponse.json(
        {
          error: isBlobTokenMissing
            ? "Image download requires either Vercel Blob storage (configure BLOB_READ_WRITE_TOKEN) or an active publish branch on GitHub. Please set up one of these options."
            : "Image download requires an active publish branch. Start a publish draft first, then retry download.",
          diagnostics: blobDiagnostics,
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
      fileName: resolvedFileName,
      contentBase64,
    })

    const mediaOpId = await convex.mutation(api.mediaOps.stage, {
      projectId: project._id,
      userId: convexUserId,
      projectAccessToken,
      repoPath,
      fileName: sanitizeFileName(resolvedFileName),
      mimeType: contentType || getContentType(resolvedFileName),
      sizeBytes,
      sourceFilePath,
      sourceType: "githubBranch",
      githubBranch: activePublishBranch.branchName,
      githubPath,
      githubSha: baseShaAtStage ?? undefined,
    })

    await recordMediaAsset({
      convex,
      api,
      projectId: project._id,
      userId: convexUserId,
      projectAccessToken,
      fileName: resolvedFileName,
      filePath: repoPath,
      mimeType: contentType || getContentType(resolvedFileName),
      sizeBytes,
      githubSha: githubUpload.sha ?? baseShaAtStage ?? undefined,
      originalUrl: url,
      metadata: imageMetadata,
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
    })
  } catch (error) {
    console.error("[media-download-external] failed", error)
    return NextResponse.json({ error: "Failed to download external image" }, { status: 500 })
  }
}
