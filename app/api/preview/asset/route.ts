import { posix as path } from "node:path"
import { ConvexHttpClient } from "convex/browser"
import { z } from "zod"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { GitHubReadError, getBranchHeadSha, getFileBytesForPublish } from "@/lib/github"
import { sanitizeCompatibleImageSource } from "@/lib/preview/image-source-policy"
import { compatiblePreviewSourcePathSchema } from "@/lib/preview/product-extension"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"
import { detectImageMimeType, ExternalImageError, fetchBoundedExternalImage } from "@/lib/server/external-image"

export const runtime = "nodejs"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
const MAX_REQUEST_BYTES = 4 * 1024
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const IMAGE_TIMEOUT_MS = 5_000
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"])

const requestSchema = z
  .object({
    projectId: z.string().min(1).max(256),
    filePath: compatiblePreviewSourcePathSchema.refine((value) => value.toLowerCase().endsWith(".mdx")),
    baseCommitSha: z.string().regex(/^[a-f0-9]{40}$/u),
    source: z.string().min(1).max(2_048),
  })
  .strict()

class PreviewAssetRouteError extends Error {
  constructor(readonly status: number) {
    super("Preview asset unavailable")
  }
}

function errorResponse(status: number) {
  return Response.json(
    { error: "Preview asset unavailable" },
    { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  )
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
  if (contentType !== "application/json") throw new PreviewAssetRouteError(415)
  const declaredLength = request.headers.get("content-length")
  if (declaredLength && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)) {
    throw new PreviewAssetRouteError(413)
  }
  const reader = request.body?.getReader()
  if (!reader) throw new PreviewAssetRouteError(400)
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new PreviewAssetRouteError(413)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch {
    throw new PreviewAssetRouteError(400)
  }
}

function resolveRepositoryPath(documentPath: string, source: string) {
  const decodedSource = decodeURIComponent(source)
  const repoPath = decodedSource.startsWith("/")
    ? decodedSource.slice(1)
    : path.posix.join(path.posix.dirname(documentPath), decodedSource)
  const parsed = compatiblePreviewSourcePathSchema.safeParse(repoPath)
  if (!parsed.success) throw new PreviewAssetRouteError(400)
  return parsed.data
}

function imageResponse(bytes: Uint8Array, mimeType: string) {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(bytes.byteLength),
      "Content-Type": mimeType,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) return errorResponse(403)

  try {
    const input = requestSchema.parse(await readBoundedJson(request))
    const source = sanitizeCompatibleImageSource(input.source)
    if (!source) throw new PreviewAssetRouteError(400)

    const project = await convex.query(api.projects.get, {
      id: input.projectId as Id<"projects">,
      serverQueryToken: await mintServerQueryToken(),
    })
    if (!project) throw new PreviewAssetRouteError(404)

    let auth: Awaited<ReturnType<typeof resolveRouteAuth>>
    try {
      auth = await resolveRouteAuth(project, "editor")
    } catch (error) {
      if (error instanceof RouteAuthError) throw new PreviewAssetRouteError(error.status)
      throw error
    }

    const currentHead = await getBranchHeadSha(auth.githubToken, project.repoOwner, project.repoName, project.branch)
    if (currentHead !== input.baseCommitSha) throw new PreviewAssetRouteError(409)

    if (/^https:/iu.test(source)) {
      const image = await fetchBoundedExternalImage({
        url: source,
        maxBytes: MAX_IMAGE_BYTES,
        timeoutMs: IMAGE_TIMEOUT_MS,
        mimePolicy: { kind: "strict", allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES },
      })
      if (
        image.bytes.byteLength > MAX_IMAGE_BYTES ||
        !ALLOWED_IMAGE_MIME_TYPES.has(image.mimeType) ||
        detectImageMimeType(image.bytes) !== image.mimeType
      ) {
        throw new PreviewAssetRouteError(415)
      }
      return imageResponse(image.bytes, image.mimeType)
    }

    const repoPath = resolveRepositoryPath(input.filePath, source)
    const read = await getFileBytesForPublish(
      auth.githubToken,
      project.repoOwner,
      project.repoName,
      repoPath,
      input.baseCommitSha,
      MAX_IMAGE_BYTES,
    )
    if (read.status === "absent") throw new PreviewAssetRouteError(404)
    const bytes = read.file.bytes
    if (!bytes) throw new PreviewAssetRouteError(502)
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new PreviewAssetRouteError(413)
    const mimeType = detectImageMimeType(bytes)
    if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) throw new PreviewAssetRouteError(415)
    return imageResponse(bytes, mimeType)
  } catch (error) {
    if (error instanceof PreviewAssetRouteError) return errorResponse(error.status)
    if (error instanceof RouteAuthError) return errorResponse(error.status)
    if (error instanceof GitHubReadError) return errorResponse(502)
    if (error instanceof ExternalImageError) {
      if (error.code === "too-large") return errorResponse(413)
      if (error.code === "unsupported-media" || error.code === "unsafe-url") return errorResponse(415)
      return errorResponse(502)
    }
    if (error && typeof error === "object" && "issues" in error) return errorResponse(400)
    return errorResponse(500)
  }
}
