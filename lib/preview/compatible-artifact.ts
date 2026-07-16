import { z } from "zod"
import { SANDBOX_MAX_MESSAGE_BYTES, SANDBOX_PROTOCOL_VERSION } from "./sandbox-protocol"

export const COMPATIBLE_ARTIFACT_MAX_BYTES = 1024 * 1024
export const COMPATIBLE_ARTIFACT_CHUNK_BYTES = 32 * 1024
export const COMPATIBLE_ARTIFACT_MAX_CHUNKS = COMPATIBLE_ARTIFACT_MAX_BYTES / COMPATIBLE_ARTIFACT_CHUNK_BYTES
export const COMPATIBLE_COMMAND_RATE_BURST = COMPATIBLE_ARTIFACT_MAX_CHUNKS + 2

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)
const sourcePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "Compatible source paths must be normalized repository-relative paths",
  )
const sourceMapSchema = z
  .record(sourcePathSchema, z.string())
  .refine((sources) => Object.keys(sources).length <= 64, "Compatible source graphs are limited to 64 files")
const adapterSourceSchema = z
  .object({ entryPath: sourcePathSchema, sources: sourceMapSchema })
  .strict()
  .refine((adapter) => Object.hasOwn(adapter.sources, adapter.entryPath), "Adapter entry source is required")

/** Inert repository source. This value is never itself a trust decision. */
export const compatibleSourceArtifactSchema = z
  .object({
    artifactId: z.string().min(1).max(256),
    documentSource: z.string(),
    adapter: adapterSourceSchema.nullable(),
  })
  .strict()
export type CompatibleSourceArtifact = z.infer<typeof compatibleSourceArtifactSchema>

/**
 * Resolution metadata supplied by the authenticated preview orchestrator.
 * Structural validation cannot grant approval; callers must obtain this value
 * from that server authority. The digest is recomputed before any frame mounts
 * and again before the sandbox accepts the assembled source.
 */
export const signedCompatiblePreviewResolutionSchema = z
  .object({
    authority: z
      .object({
        kind: z.literal("signed-preview-resolution"),
        algorithm: z.literal("ECDSA-P256-SHA256"),
        keyId: z.string().min(1).max(256),
        approvalId: z.string().min(1).max(256),
        tenantId: z.string().min(1).max(256),
        projectId: z.string().min(1).max(256),
        baseCommit: z.string().min(1).max(256),
        sessionId: z.string().min(1).max(256),
        snapshotVersion: z.number().int().positive().safe(),
        issuedAt: z.number().int().nonnegative().safe(),
        expiresAt: z.number().int().positive().safe(),
        executableDigest: digestSchema,
        signature: z.string().regex(/^[A-Za-z0-9_-]{80,128}$/),
      })
      .strict(),
    artifact: compatibleSourceArtifactSchema,
  })
  .strict()
export type SignedCompatiblePreviewResolution = z.infer<typeof signedCompatiblePreviewResolutionSchema>

const commandFields = {
  protocolVersion: z.literal(SANDBOX_PROTOCOL_VERSION),
  sessionId: z.string().min(1).max(256),
  snapshotVersion: z.number().int().positive().safe(),
  sequence: z.number().int().positive().safe(),
}
const transferIdSchema = z.string().min(16).max(128)

export const compatibleTransferCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...commandFields,
      type: z.literal("repopress:artifact-start"),
      payload: z
        .object({
          transferId: transferIdSchema,
          totalBytes: z.number().int().positive().max(COMPATIBLE_ARTIFACT_MAX_BYTES),
          totalChunks: z.number().int().positive().max(COMPATIBLE_ARTIFACT_MAX_CHUNKS),
          digest: digestSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...commandFields,
      type: z.literal("repopress:artifact-chunk"),
      payload: z
        .object({
          transferId: transferIdSchema,
          index: z
            .number()
            .int()
            .nonnegative()
            .max(COMPATIBLE_ARTIFACT_MAX_CHUNKS - 1),
          data: z.string().regex(/^[A-Za-z0-9_-]+$/),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...commandFields,
      type: z.literal("repopress:artifact-commit"),
      payload: z.object({ transferId: transferIdSchema }).strict(),
    })
    .strict(),
])
export type CompatibleTransferCommand = z.infer<typeof compatibleTransferCommandSchema>

function deepFreeze<T>(input: T): T {
  if (input !== null && typeof input === "object" && !Object.isFrozen(input)) {
    for (const key of Object.keys(input)) deepFreeze(Object.getOwnPropertyDescriptor(input, key)?.value)
    Object.freeze(input)
  }
  return input
}

function boundedUtf8Length(value: string, limit: number): boolean {
  if (value.length > limit) return false
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit <= 0x7f) bytes += 1
    else if (unit <= 0x7ff) bytes += 2
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else bytes += 3
    } else bytes += 3
    if (bytes > limit) return false
  }
  return true
}

function canonicalizeResolution(input: SignedCompatiblePreviewResolution): string {
  const sources = input.artifact.adapter?.sources
  const sortedSources = sources
    ? Object.fromEntries(Object.entries(sources).sort(([left], [right]) => left.localeCompare(right)))
    : undefined
  return JSON.stringify({
    authority: input.authority,
    artifact: {
      artifactId: input.artifact.artifactId,
      documentSource: input.artifact.documentSource,
      adapter: input.artifact.adapter ? { entryPath: input.artifact.adapter.entryPath, sources: sortedSources } : null,
    },
  })
}

function executableSource(input: CompatibleSourceArtifact): string {
  const sources = input.adapter?.sources
  return JSON.stringify({
    artifactId: input.artifactId,
    documentSource: input.documentSource,
    adapter: input.adapter
      ? {
          entryPath: input.adapter.entryPath,
          sources: Object.fromEntries(
            Object.entries(sources ?? {}).sort(([left], [right]) => left.localeCompare(right)),
          ),
        }
      : null,
  })
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export function decodeCompatibleArtifactChunk(data: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(data)) return null
  try {
    const padded = data
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(data.length / 4) * 4, "=")
    const binary = atob(padded)
    if (binary.length > COMPATIBLE_ARTIFACT_CHUNK_BYTES) return null
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is required for compatible artifacts")
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")
}

export async function computeCompatibleExecutableDigest(artifact: CompatibleSourceArtifact): Promise<string> {
  const parsed = compatibleSourceArtifactSchema.parse(artifact)
  return sha256Hex(new TextEncoder().encode(executableSource(parsed)))
}

export function createCompatibleApprovalPayload(
  resolution: Omit<SignedCompatiblePreviewResolution, "authority"> & {
    authority: Omit<SignedCompatiblePreviewResolution["authority"], "signature">
  },
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      authority: resolution.authority,
      artifactDigest: resolution.authority.executableDigest,
    }),
  )
}

export function parseConfiguredPreviewApprovalKey(input: string | undefined): JsonWebKey | null {
  if (!input || input.length > 2_048) return null
  try {
    const value = JSON.parse(input) as JsonWebKey
    if (
      value.kty !== "EC" ||
      value.crv !== "P-256" ||
      typeof value.x !== "string" ||
      typeof value.y !== "string" ||
      (value.key_ops !== undefined && !value.key_ops.includes("verify"))
    ) {
      return null
    }
    return deepFreeze({ kty: value.kty, crv: value.crv, x: value.x, y: value.y, key_ops: ["verify"], ext: true })
  } catch {
    return null
  }
}

function decodeSignature(input: string): Uint8Array | null {
  const decoded = decodeCompatibleArtifactChunk(input)
  return decoded?.length === 64 ? decoded : null
}

export async function verifySignedCompatiblePreviewResolution(
  input: unknown,
  options: { publicKey: JsonWebKey; expectedSessionId: string; expectedSnapshotVersion: number; now?: number },
): Promise<SignedCompatiblePreviewResolution | null> {
  const parsed = signedCompatiblePreviewResolutionSchema.safeParse(input)
  if (!parsed.success) return null
  const resolution = parsed.data
  const now = options.now ?? Date.now()
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    resolution.authority.sessionId !== options.expectedSessionId ||
    resolution.authority.snapshotVersion !== options.expectedSnapshotVersion ||
    resolution.authority.issuedAt > now + 30_000 ||
    resolution.authority.expiresAt <= now ||
    resolution.authority.expiresAt <= resolution.authority.issuedAt ||
    resolution.authority.expiresAt - resolution.authority.issuedAt > 5 * 60_000
  ) {
    return null
  }
  const digest = await computeCompatibleExecutableDigest(parsed.data.artifact)
  if (digest !== resolution.authority.executableDigest) return null
  const signature = decodeSignature(resolution.authority.signature)
  if (!signature || !globalThis.crypto?.subtle) return null
  try {
    const key = await globalThis.crypto.subtle.importKey(
      "jwk",
      options.publicKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    )
    const { signature: _signature, ...authority } = resolution.authority
    const valid = await globalThis.crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature as BufferSource,
      createCompatibleApprovalPayload({ authority, artifact: resolution.artifact }) as BufferSource,
    )
    return valid ? deepFreeze(resolution) : null
  } catch {
    return null
  }
}

export async function verifyCompatibleExecutableDigest(
  input: SignedCompatiblePreviewResolution,
): Promise<SignedCompatiblePreviewResolution | null> {
  const parsed = signedCompatiblePreviewResolutionSchema.safeParse(input)
  if (!parsed.success) return null
  const digest = await computeCompatibleExecutableDigest(parsed.data.artifact)
  return digest === parsed.data.authority.executableDigest ? deepFreeze(parsed.data) : null
}

function serializeCommand(command: CompatibleTransferCommand): string {
  const parsed = compatibleTransferCommandSchema.parse(command)
  const wire = JSON.stringify(parsed)
  if (!boundedUtf8Length(wire, SANDBOX_MAX_MESSAGE_BYTES)) throw new RangeError("Compatible command is too large")
  return wire
}

export async function serializeCompatibleArtifactTransfer(input: {
  resolution: SignedCompatiblePreviewResolution
  publicKey: JsonWebKey
  sessionId: string
  snapshotVersion: number
}): Promise<string[]> {
  const resolution = await verifySignedCompatiblePreviewResolution(input.resolution, {
    publicKey: input.publicKey,
    expectedSessionId: input.sessionId,
    expectedSnapshotVersion: input.snapshotVersion,
  })
  if (!resolution) throw new TypeError("An authenticated, digest-bound compatible resolution is required")
  const bytes = new TextEncoder().encode(canonicalizeResolution(resolution))
  if (bytes.length === 0 || bytes.length > COMPATIBLE_ARTIFACT_MAX_BYTES) {
    throw new RangeError("Compatible artifact exceeds the transfer limit")
  }
  const totalChunks = Math.ceil(bytes.length / COMPATIBLE_ARTIFACT_CHUNK_BYTES)
  const digest = await sha256Hex(bytes)
  const randomBytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const transferId = bytesToBase64Url(randomBytes)
  let sequence = 1
  const wires = [
    serializeCommand({
      protocolVersion: SANDBOX_PROTOCOL_VERSION,
      type: "repopress:artifact-start",
      sessionId: input.sessionId,
      snapshotVersion: input.snapshotVersion,
      sequence: sequence++,
      payload: { transferId, totalBytes: bytes.length, totalChunks, digest },
    }),
  ]
  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * COMPATIBLE_ARTIFACT_CHUNK_BYTES
    wires.push(
      serializeCommand({
        protocolVersion: SANDBOX_PROTOCOL_VERSION,
        type: "repopress:artifact-chunk",
        sessionId: input.sessionId,
        snapshotVersion: input.snapshotVersion,
        sequence: sequence++,
        payload: {
          transferId,
          index,
          data: bytesToBase64Url(bytes.slice(start, start + COMPATIBLE_ARTIFACT_CHUNK_BYTES)),
        },
      }),
    )
  }
  wires.push(
    serializeCommand({
      protocolVersion: SANDBOX_PROTOCOL_VERSION,
      type: "repopress:artifact-commit",
      sessionId: input.sessionId,
      snapshotVersion: input.snapshotVersion,
      sequence,
      payload: { transferId },
    }),
  )
  return wires
}

export function parseCompatibleTransferCommand(input: unknown): CompatibleTransferCommand | null {
  if (typeof input !== "string" || !boundedUtf8Length(input, SANDBOX_MAX_MESSAGE_BYTES)) return null
  let decoded: unknown
  try {
    decoded = JSON.parse(input)
  } catch {
    return null
  }
  const parsed = compatibleTransferCommandSchema.safeParse(decoded)
  return parsed.success ? deepFreeze(parsed.data) : null
}

export function parseAssembledCompatibleResolution(input: Uint8Array): SignedCompatiblePreviewResolution | null {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(input)
    const parsed = signedCompatiblePreviewResolutionSchema.safeParse(JSON.parse(decoded))
    return parsed.success ? deepFreeze(parsed.data) : null
  } catch {
    return null
  }
}
