import { randomBytes } from "node:crypto"
import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { GitHubReadError, getBranchHeadSha, getFileForPublish } from "@/lib/github"
import { assertCompatibleAdapterImports, CompatibleAdapterImportError } from "@/lib/preview/adapter-import-policy"
import {
  assertCompatibleSourceArtifactWithinBounds,
  type CompatiblePreviewAuthorityContext,
  serializeSignedCompatiblePreviewResolution,
} from "@/lib/preview/compatible-artifact"
import {
  CompatiblePreviewSigningUnavailableError,
  signCompatiblePreviewResolution,
} from "@/lib/preview/compatible-signing.server"
import {
  compatiblePreviewRequestSchema,
  compatiblePreviewRouteResponseSchema,
  compatiblePreviewSourcePathSchema,
} from "@/lib/preview/product-extension"
import { mintServerQueryToken } from "@/lib/project-access-token"
import { RouteAuthError, resolveRouteAuth } from "@/lib/route-auth"

export const runtime = "nodejs"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
const MAX_REQUEST_BYTES = 544 * 1024
const DEFAULT_KEY_ID = "repopress-preview-p256-v1"

class CompatiblePreviewRouteError extends Error {
  constructor(readonly status: number) {
    super("Compatible preview request failed")
  }
}

function response(payload: unknown, status: number) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } })
}

function errorResponse(status: number) {
  return response({ error: "Compatible preview is unavailable" }, status)
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
  if (contentType !== "application/json") throw new CompatiblePreviewRouteError(415)
  const length = request.headers.get("content-length")
  if (length && (!/^\d+$/u.test(length) || Number(length) > MAX_REQUEST_BYTES)) {
    throw new CompatiblePreviewRouteError(413)
  }
  const reader = request.body?.getReader()
  if (!reader) throw new CompatiblePreviewRouteError(400)
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new CompatiblePreviewRouteError(413)
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
    throw new CompatiblePreviewRouteError(400)
  }
}

function resolveSandboxTarget(): string {
  const configured = process.env.NEXT_PUBLIC_PREVIEW_ORIGIN?.trim()
  if (!configured) throw new CompatiblePreviewRouteError(503)
  try {
    const url = new URL(configured)
    const normalized = configured.endsWith("/") ? configured.slice(0, -1) : configured
    if (url.protocol !== "https:" || url.origin !== normalized || url.pathname !== "/" || url.search || url.hash) {
      throw new CompatiblePreviewRouteError(503)
    }
    return new URL("/preview/sandbox", url).toString()
  } catch (error) {
    if (error instanceof CompatiblePreviewRouteError) throw error
    throw new CompatiblePreviewRouteError(503)
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) return errorResponse(403)

  try {
    const input = compatiblePreviewRequestSchema.parse(await readBoundedJson(request))
    const serverQueryToken = await mintServerQueryToken()
    const project = await convex.query(api.projects.get, {
      id: input.projectId as Id<"projects">,
      serverQueryToken,
    })
    if (!project) throw new CompatiblePreviewRouteError(404)

    let auth: Awaited<ReturnType<typeof resolveRouteAuth>>
    try {
      auth = await resolveRouteAuth(project, "editor")
    } catch (error) {
      if (error instanceof RouteAuthError) throw new CompatiblePreviewRouteError(error.status)
      throw error
    }

    const currentHead = await getBranchHeadSha(auth.githubToken, project.repoOwner, project.repoName, project.branch)
    if (currentHead !== input.baseCommitSha) throw new CompatiblePreviewRouteError(409)

    const entry = compatiblePreviewSourcePathSchema.safeParse(project.previewEntry)
    if (!entry.success) throw new CompatiblePreviewRouteError(422)
    const adapterRead = await getFileForPublish(
      auth.githubToken,
      project.repoOwner,
      project.repoName,
      entry.data,
      currentHead,
    )
    if (adapterRead.status === "absent") throw new CompatiblePreviewRouteError(422)

    const sessionId = randomBytes(16).toString("base64url")
    const approvalId = randomBytes(16).toString("base64url")
    const artifact = {
      artifactId: `preview-${approvalId}`,
      documentSource: input.documentSource,
      adapter: { entryPath: entry.data, sources: { [entry.data]: adapterRead.file.content } },
    }
    assertCompatibleSourceArtifactWithinBounds(artifact)
    assertCompatibleAdapterImports(adapterRead.file.content, entry.data)
    const authority: CompatiblePreviewAuthorityContext = {
      tenantId: String(project.userId),
      projectId: String(project._id),
      baseCommit: currentHead,
      documentPath: input.filePath,
      sessionId,
      snapshotVersion: input.snapshotVersion,
    }
    const resolution = await signCompatiblePreviewResolution({
      artifact,
      authority,
      approvalId,
      keyId: process.env.PREVIEW_APPROVAL_KEY_ID?.trim() || DEFAULT_KEY_ID,
    })
    const result = compatiblePreviewRouteResponseSchema.parse({
      previewResult: {
        fidelity: "compatible",
        sessionId,
        snapshotVersion: input.snapshotVersion,
        status: "ready",
        target: { kind: "sandboxed-iframe", url: resolveSandboxTarget() },
        diagnostics: [],
        downgradeReasons: [],
        cache: { hit: false },
      },
      resolution: serializeSignedCompatiblePreviewResolution(resolution),
      authority,
    })
    return response(result, 200)
  } catch (error) {
    if (error instanceof CompatiblePreviewRouteError) return errorResponse(error.status)
    if (error instanceof CompatibleAdapterImportError || error instanceof RangeError) return errorResponse(422)
    if (error instanceof CompatiblePreviewSigningUnavailableError) return errorResponse(503)
    if (error instanceof GitHubReadError) return errorResponse(502)
    if (error && typeof error === "object" && "issues" in error) return errorResponse(400)
    return errorResponse(500)
  }
}
