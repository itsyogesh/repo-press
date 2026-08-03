import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"
import { ExternalImageError, fetchBoundedExternalImage } from "@/lib/server/external-image"
import { buildMediaResolveUrl } from "@/lib/studio/media-resolve"
import {
  buildRepoPath,
  getContentType,
  getExistingFileShaSafe,
  getImageMetadata,
  recordMediaAsset,
  resolveProject,
  sanitizeFileName,
  uploadToConvexStorage,
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DownloadExternalRequest
    const { projectId, owner, repo, branch, pathHint, fileName, sourceFilePath, url } = body

    if (!owner || !repo || !branch || !url) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
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

    let externalImage: Awaited<ReturnType<typeof fetchBoundedExternalImage>>
    try {
      externalImage = await fetchBoundedExternalImage({
        url,
        maxBytes: MAX_EXTERNAL_IMAGE_BYTES,
        timeoutMs: 15_000,
        mimePolicy: { kind: "legacy-image" },
      })
    } catch (error) {
      if (error instanceof ExternalImageError) {
        if (error.code === "unsafe-url") {
          return NextResponse.json({ error: "External image must resolve to a public HTTP(S) URL" }, { status: 400 })
        }
        if (error.code === "unsupported-media") {
          return NextResponse.json({ error: "External image must resolve to an image content type" }, { status: 400 })
        }
        if (error.code === "too-large") {
          return NextResponse.json({ error: "External image exceeds maximum file size of 10MB" }, { status: 413 })
        }
        return NextResponse.json({ error: "Failed to fetch external image" }, { status: 502 })
      }
      throw error
    }
    const contentType = externalImage.mimeType
    const contentBuffer = Buffer.from(externalImage.bytes)

    const resolvedFileName = deriveFileName(url, fileName, contentType)
    const repoPath = buildRepoPath(pathHint, resolvedFileName)
    const githubPath = repoPath.replace(/^\/+/, "")
    const sizeBytes = contentBuffer.byteLength
    const imageMetadata = await getImageMetadata(contentBuffer)
    const baseShaAtStage = await getExistingFileShaSafe(token, owner, repo, githubPath, project.branch)

    // Upload to Convex file storage - no branch or Blob token required.
    const { storageId } = await uploadToConvexStorage({
      convex,
      api,
      projectId: project._id,
      userId: convexUserId,
      projectAccessToken,
      content: contentBuffer,
      contentType: contentType || getContentType(resolvedFileName),
    })

    const stageResult = await convex.mutation(api.mediaOps.stage, {
      projectId: project._id,
      userId: convexUserId,
      projectAccessToken,
      repoPath,
      fileName: sanitizeFileName(resolvedFileName),
      mimeType: contentType || getContentType(resolvedFileName),
      sizeBytes,
      sourceFilePath,
      sourceType: "convex",
      convexStorageId: storageId,
      githubSha: baseShaAtStage ?? undefined,
    })
    if (!stageResult.staged) {
      // The replacement was refused because a publish attempt is at the
      // commit boundary; stage already deleted the just-uploaded bytes.
      return NextResponse.json(
        {
          error:
            "A publish is finalizing for this project and the staged upload for this path is locked. Retry the download after the publish completes.",
        },
        { status: 409 },
      )
    }
    const mediaOpId = stageResult.mediaOpId

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
      storage: "convex",
      repoPath,
      previewUrl,
      staged: true,
      mediaOpId,
      url: previewUrl,
    })
  } catch (error) {
    console.error("[media-download-external] failed", error)
    return NextResponse.json({ error: "Failed to download external image" }, { status: 500 })
  }
}
