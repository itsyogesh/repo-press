import { z } from "zod"

type JsonPrimitive = boolean | number | string | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
)

export const previewFidelitySchema = z.enum(["generic", "compatible", "native"])
export type PreviewFidelity = z.infer<typeof previewFidelitySchema>

export const previewSessionStatusSchema = z.enum(["queued", "building", "ready", "failed", "expired"])
export type PreviewSessionStatus = z.infer<typeof previewSessionStatusSchema>

export const previewDiagnosticSchema = z
  .object({
    stage: z.enum(["detect", "resolve", "install", "compile", "execute", "render", "asset"]),
    severity: z.enum(["info", "warning", "error"]),
    code: z.string().min(1),
    message: z.string().min(1),
    file: z.string().min(1).optional(),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    importChain: z.array(z.string().min(1)).optional(),
    recoverable: z.boolean(),
    fidelityImpact: previewFidelitySchema.optional(),
  })
  .strict()
export type PreviewDiagnostic = z.infer<typeof previewDiagnosticSchema>

export const genericRenderModelSchema = z
  .object({
    blocks: z.array(z.record(jsonValueSchema)),
  })
  .strict()
export type GenericRenderModel = z.infer<typeof genericRenderModelSchema>

export const fileOverlayOperationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("write"),
      path: z.string().min(1),
      content: z.string(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("delete"),
      path: z.string().min(1),
    })
    .strict(),
])
export type FileOverlayOperation = z.infer<typeof fileOverlayOperationSchema>

/**
 * Internal, server-constructed preview input. Repository identity, authorization,
 * and provider selection are derived from the authenticated project separately.
 */
export const previewRequestSchema = z
  .object({
    filePath: z.string().min(1),
    snapshotVersion: z.number().int().positive(),
    base: z
      .object({
        ref: z.string().min(1),
        commitSha: z.string().min(1),
      })
      .strict(),
    document: z
      .object({
        contentType: z.enum(["md", "mdx"]),
        body: z.string(),
        metadata: z.record(jsonValueSchema),
      })
      .strict(),
    overlay: z.array(fileOverlayOperationSchema),
    viewport: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict(),
    theme: z.enum(["light", "dark", "system"]).optional(),
  })
  .strict()
export type PreviewRequest = z.infer<typeof previewRequestSchema>

const previewTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("sandboxed-iframe"),
      url: z.string().url(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("safe-fallback"),
      renderModel: genericRenderModelSchema,
    })
    .strict(),
])

export const previewResultSchema = z
  .object({
    fidelity: previewFidelitySchema,
    sessionId: z.string().min(1),
    snapshotVersion: z.number().int().positive(),
    status: previewSessionStatusSchema,
    target: previewTargetSchema,
    diagnostics: z.array(previewDiagnosticSchema),
    downgradeReasons: z.array(z.string().min(1)),
    cache: z
      .object({
        hit: z.boolean(),
      })
      .strict(),
  })
  .strict()
export type PreviewResult = z.infer<typeof previewResultSchema>

export const previewSessionEventSchema = z
  .object({
    sessionId: z.string().min(1),
    snapshotVersion: z.number().int().positive(),
    sequence: z.number().int().positive(),
    type: z.enum(["status", "target", "diagnostics", "fidelity", "expired"]),
    payload: jsonValueSchema,
  })
  .strict()
export type PreviewSessionEvent = z.infer<typeof previewSessionEventSchema>

export const runtimeProfileSchema = z
  .object({
    framework: z.enum(["next", "fumadocs", "astro", "generic"]),
    frameworkVersion: z.string().min(1).optional(),
    runtimeRoot: z.string(),
    contentRoots: z.array(z.string()),
    packageManager: z.enum(["npm", "pnpm", "yarn", "bun"]).optional(),
    lockfilePath: z.string().min(1).optional(),
    componentEntrypoints: z.array(z.string().min(1)),
    styleEntrypoints: z.array(z.string().min(1)),
    capabilities: z
      .object({
        clientComponents: z.boolean(),
        serverComponents: z.boolean(),
        css: z.boolean(),
        portals: z.boolean(),
        astroIslands: z.boolean(),
      })
      .strict(),
    detection: z
      .object({
        confidence: z.number().min(0).max(1),
        evidence: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict()
export type RuntimeProfile = z.infer<typeof runtimeProfileSchema>
