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
  uploadToConvexStorage,
} from "@/lib/studio/media-upload-shared"

export const runtime = "nodejs"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

// Maximum upload size - 50MB (base64 string is ~33% larger than binary)
const MAX_UPLOAD_BASE64_LENGTH = Math.ceil(50 * 1024 * 1024 * (4 / 3))

interface UploadRequest {
  projectId?: string
  owner: string
  repo: string
  branch: string
  pathHint?: string
  sourceFilePath?: string
  fileName: string
  contentBase64: string
}

interface UploadResponse {
  storage: "convex"
  repoPath: string
  previewUrl: string
  staged: true
  mediaOpId: string
  url: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UploadRequest
    const { projectId, owner, repo, branch, pathHint, sourceFilePath, fileName, contentBase64 } = body

    if (!owner || !repo || !branch || !fileName || !contentBase64) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (contentBase64.length > MAX_UPLOAD_BASE64_LENGTH) {
      return NextResponse.json({ error: "Upload exceeds maximum file size of 50MB" }, { status: 413 })
    }

    const project = await resolveProject({ convex, api, projectId, owner, repo, branch })
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
    const imageMetadata = await getImageMetadata(contentBuffer)

    // Capture base-branch SHA at staging time for later publish conflict detection.
    const baseShaAtStage = await getExistingFileShaSafe(token, owner, repo, githubPath, project.branch)

    // Upload to Convex file storage - no branch or Blob token required.
    const { storageId } = await uploadToConvexStorage({
      convex,
      api,
      projectId: project._id,
      userId: convexUserId,
      projectAccessToken,
      content: contentBuffer,
      contentType,
    })

    const stageResult = await convex.mutation(api.mediaOps.stage, {
      projectId: project._id,
      userId: convexUserId,
      projectAccessToken,
      repoPath,
      fileName: sanitizeFileName(fileName),
      mimeType: contentType,
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
            "A publish is finalizing for this project and the staged upload for this path is locked. Retry the upload after the publish completes.",
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
      fileName,
      filePath: repoPath,
      mimeType: contentType,
      sizeBytes,
      githubSha: baseShaAtStage ?? undefined,
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
    } satisfies UploadResponse)
  } catch (error) {
    console.error("[media-upload] failed", error)
    return NextResponse.json({ error: "Failed to upload media" }, { status: 500 })
  }
}
