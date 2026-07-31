import type { LookupAddress } from "node:dns"
import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"
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
const MAX_EXTERNAL_IMAGE_BYTES = 10 * 1024 * 1024
const BLOCKED_IPV4_RANGES = new BlockList()
const BLOCKED_IPV6_RANGES = new BlockList()

for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED_IPV4_RANGES.addSubnet(address, prefix, "ipv4")
}

for (const [address, prefix] of [
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED_IPV6_RANGES.addSubnet(address, prefix, "ipv6")
}

BLOCKED_IPV6_RANGES.addAddress("::", "ipv6")
BLOCKED_IPV6_RANGES.addAddress("::1", "ipv6")

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
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !isBlockedHostname(parsed.hostname)
  } catch {
    return false
  }
}

function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "")
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1)
  }
  return normalized
}

function isBlockedIpAddress(address: string): boolean {
  const normalized = normalizeHostname(address)
  const ipVersion = isIP(normalized)
  if (ipVersion === 0) return false
  return ipVersion === 4 ? BLOCKED_IPV4_RANGES.check(normalized, "ipv4") : BLOCKED_IPV6_RANGES.check(normalized, "ipv6")
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  if (!normalized) return true
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    return true
  }

  if (isBlockedIpAddress(normalized)) {
    return true
  }

  return false
}

async function assertPublicHostname(hostname: string): Promise<void> {
  if (isBlockedHostname(hostname)) {
    throw new Error("External image must resolve to a public HTTP(S) URL")
  }

  const normalized = normalizeHostname(hostname)
  if (isIP(normalized)) return

  let addresses: LookupAddress[]
  try {
    addresses = await lookup(normalized, { all: true, verbatim: true })
  } catch {
    throw new Error("External image must resolve to a public HTTP(S) URL")
  }

  if (!addresses.length || addresses.some((entry) => isBlockedIpAddress(entry.address))) {
    throw new Error("External image must resolve to a public HTTP(S) URL")
  }
}

async function fetchExternalImage(url: string, maxRedirects = 5): Promise<Response> {
  let currentUrl = url

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const currentTarget = new URL(currentUrl)
    await assertPublicHostname(currentTarget.hostname)
    const response = await fetch(currentUrl, { redirect: "manual" })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) {
        throw new Error("External image redirect is missing a Location header")
      }

      const nextUrl = new URL(location, currentUrl)
      if (!isSafeExternalUrl(nextUrl.toString())) {
        throw new Error("External image must resolve to a public HTTP(S) URL")
      }
      await assertPublicHostname(nextUrl.hostname)
      currentUrl = nextUrl.toString()
      continue
    }

    return response
  }

  throw new Error("External image exceeded maximum redirect depth")
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

    if (!isSafeExternalUrl(url)) {
      return NextResponse.json({ error: "External image must resolve to a public HTTP(S) URL" }, { status: 400 })
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

    let externalResponse: Response
    try {
      externalResponse = await fetchExternalImage(url)
    } catch (error) {
      if (error instanceof Error && error.message.includes("public HTTP(S) URL")) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      throw error
    }

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
