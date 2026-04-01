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

type StoragePreference = "auto" | "blob" | "github"

// Fix #3: Maximum upload size — 50MB (base64 string is ~33% larger than binary)
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UploadRequest
    const {
      projectId,
      owner,
      repo,
      branch,
      pathHint,
      sourceFilePath,
      fileName,
      contentBase64,
      storagePreference = "auto",
    } = body

    if (!owner || !repo || !branch || !fileName || !contentBase64) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Fix #3: Validate upload size before decoding base64 to prevent OOM
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

    let blobDiagnostics: Record<string, string> | undefined

    if (shouldTryBlob(storagePreference)) {
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
          fileName: sanitizeFileName(fileName),
          mimeType: contentType,
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
          fileName,
          filePath: repoPath,
          mimeType: contentType,
          sizeBytes,
          githubSha: baseShaAtStage ?? undefined,
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
      const isBlobTokenMissing = blobDiagnostics?.blob === "token-missing"
      return NextResponse.json(
        {
          error: isBlobTokenMissing
            ? "Image upload requires either Vercel Blob storage (configure BLOB_READ_WRITE_TOKEN) or an active publish branch on GitHub. Please set up one of these options."
            : "Image upload requires an active publish branch. Start a publish draft first, then retry upload.",
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
      fileName,
      filePath: repoPath,
      mimeType: contentType,
      sizeBytes,
      githubSha: githubUpload.sha ?? baseShaAtStage ?? undefined,
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
    } satisfies UploadResponse)
  } catch (error) {
    console.error("[media-upload] failed", error)
    return NextResponse.json({ error: "Failed to upload media" }, { status: 500 })
  }
}

function shouldTryBlob(preference: StoragePreference): boolean {
  if (preference === "github") return false
  return true
}
