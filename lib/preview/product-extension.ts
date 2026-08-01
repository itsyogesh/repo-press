import { z } from "zod"
import {
  COMPATIBLE_ARTIFACT_MAX_BYTES,
  COMPATIBLE_DOCUMENT_MAX_BYTES,
  compatiblePreviewAuthorityContextSchema,
  signedCompatiblePreviewResolutionSchema,
} from "./compatible-artifact"
import { previewResultSchema } from "./contracts"

function isBoundedUtf8(value: string, maximum: number): boolean {
  return value.length <= maximum && new TextEncoder().encode(value).byteLength <= maximum
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit <= 0x1f || unit === 0x7f) return true
  }
  return false
}

export const compatiblePreviewSourcePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !hasControlCharacters(value) &&
      value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "Preview paths must be normalized repository-relative paths",
  )

export const compatiblePreviewRequestSchema = z
  .object({
    projectId: z.string().min(1).max(256),
    filePath: compatiblePreviewSourcePathSchema.refine((value) => value.toLowerCase().endsWith(".mdx"), {
      message: "Compatible product preview accepts MDX documents only",
    }),
    baseCommitSha: z.string().regex(/^[a-f0-9]{40}$/),
    snapshotVersion: z.number().int().positive().safe(),
    documentSource: z
      .string()
      .min(1)
      .refine((value) => isBoundedUtf8(value, COMPATIBLE_DOCUMENT_MAX_BYTES), {
        message: `Document source is limited to ${COMPATIBLE_DOCUMENT_MAX_BYTES} UTF-8 bytes`,
      }),
  })
  .strict()
export type CompatiblePreviewRequest = z.infer<typeof compatiblePreviewRequestSchema>

export const compatiblePreviewRouteResponseSchema = z
  .object({
    previewResult: previewResultSchema,
    resolution: z
      .string()
      .min(1)
      .max(COMPATIBLE_ARTIFACT_MAX_BYTES)
      .refine((value) => isBoundedUtf8(value, COMPATIBLE_ARTIFACT_MAX_BYTES), {
        message: "Compatible resolution exceeds the wire limit",
      }),
    authority: compatiblePreviewAuthorityContextSchema,
  })
  .strict()
  .superRefine((response, context) => {
    if (
      response.previewResult.fidelity !== "compatible" ||
      response.previewResult.status !== "ready" ||
      response.previewResult.target.kind !== "sandboxed-iframe"
    ) {
      context.addIssue({ code: "custom", message: "Compatible response requires a ready sandbox target" })
    }
    if (
      response.previewResult.sessionId !== response.authority.sessionId ||
      response.previewResult.snapshotVersion !== response.authority.snapshotVersion
    ) {
      context.addIssue({ code: "custom", message: "Preview result does not match its authority context" })
    }

    let decoded: unknown
    try {
      decoded = JSON.parse(response.resolution)
    } catch {
      context.addIssue({ code: "custom", message: "Compatible resolution is not valid JSON" })
      return
    }
    const resolution = signedCompatiblePreviewResolutionSchema.safeParse(decoded)
    if (!resolution.success) {
      context.addIssue({ code: "custom", message: "Compatible resolution is malformed" })
      return
    }
    const signedAuthority = resolution.data.authority
    if (
      signedAuthority.tenantId !== response.authority.tenantId ||
      signedAuthority.projectId !== response.authority.projectId ||
      signedAuthority.baseCommit !== response.authority.baseCommit ||
      signedAuthority.sessionId !== response.authority.sessionId ||
      signedAuthority.snapshotVersion !== response.authority.snapshotVersion
    ) {
      context.addIssue({ code: "custom", message: "Signed resolution does not match its authority context" })
    }
  })
export type CompatiblePreviewRouteResponse = z.infer<typeof compatiblePreviewRouteResponseSchema>
