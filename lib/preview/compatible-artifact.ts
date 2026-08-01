import { z } from "zod"
import { SANDBOX_MAX_MESSAGE_BYTES, SANDBOX_PROTOCOL_VERSION } from "./sandbox-protocol"

export const COMPATIBLE_ARTIFACT_MAX_BYTES = 1024 * 1024
export const COMPATIBLE_DOCUMENT_MAX_BYTES = 512 * 1024
export const COMPATIBLE_ADAPTER_SOURCE_MAX_BYTES = 256 * 1024
export const COMPATIBLE_SOURCE_TOTAL_MAX_BYTES = 768 * 1024
export const COMPATIBLE_SOURCE_FILE_MAX_COUNT = 64
export const COMPATIBLE_ARTIFACT_CHUNK_BYTES = 32 * 1024
export const COMPATIBLE_ARTIFACT_MAX_CHUNKS = COMPATIBLE_ARTIFACT_MAX_BYTES / COMPATIBLE_ARTIFACT_CHUNK_BYTES
export const COMPATIBLE_COMMAND_RATE_BURST = COMPATIBLE_ARTIFACT_MAX_CHUNKS + 2
export const COMPATIBLE_RENDERER_PROFILE = "static-inert-v1" as const

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
  .refine(
    (sources) => Object.keys(sources).length <= COMPATIBLE_SOURCE_FILE_MAX_COUNT,
    `Compatible source graphs are limited to ${COMPATIBLE_SOURCE_FILE_MAX_COUNT} files`,
  )
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
        documentPath: sourcePathSchema,
        sessionId: z.string().min(1).max(256),
        snapshotVersion: z.number().int().positive().safe(),
        rendererProfile: z.literal(COMPATIBLE_RENDERER_PROFILE),
        issuedAt: z.number().int().nonnegative().safe(),
        expiresAt: z.number().int().positive().safe(),
        executableDigest: digestSchema,
        signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
      })
      .strict(),
    artifact: compatibleSourceArtifactSchema,
  })
  .strict()
export type SignedCompatiblePreviewResolution = z.infer<typeof signedCompatiblePreviewResolutionSchema>
export const compatiblePreviewAuthorityContextSchema = z
  .object({
    tenantId: z.string().min(1).max(256),
    projectId: z.string().min(1).max(256),
    baseCommit: z.string().min(1).max(256),
    documentPath: sourcePathSchema,
    sessionId: z.string().min(1).max(256),
    snapshotVersion: z.number().int().positive().safe(),
  })
  .strict()
export type CompatiblePreviewAuthorityContext = Readonly<z.infer<typeof compatiblePreviewAuthorityContextSchema>>

declare const verifiedCompatibleResolutionBrand: unique symbol
export type VerifiedCompatiblePreviewResolution = SignedCompatiblePreviewResolution & {
  readonly [verifiedCompatibleResolutionBrand]: true
}

const verifiedCompatibleResolutions = new WeakSet<object>()

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

function utf8LengthWithin(value: string, limit: number): number | null {
  if (value.length > limit) return null
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
    if (bytes > limit) return null
  }
  return bytes
}

function boundedUtf8Length(value: string, limit: number): boolean {
  return utf8LengthWithin(value, limit) !== null
}

export function assertCompatibleSourceArtifactWithinBounds(input: CompatibleSourceArtifact): void {
  const documentBytes = utf8LengthWithin(input.documentSource, COMPATIBLE_DOCUMENT_MAX_BYTES)
  if (documentBytes === null) throw new RangeError("Compatible source artifact exceeds its executable budget")
  let totalSourceBytes = documentBytes
  if (!input.adapter) return
  for (const source of Object.values(input.adapter.sources)) {
    const sourceBytes = utf8LengthWithin(source, COMPATIBLE_ADAPTER_SOURCE_MAX_BYTES)
    if (sourceBytes === null) throw new RangeError("Compatible source artifact exceeds its executable budget")
    totalSourceBytes += sourceBytes
    if (totalSourceBytes > COMPATIBLE_SOURCE_TOTAL_MAX_BYTES) {
      throw new RangeError("Compatible source artifact exceeds its executable budget")
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && boundedUtf8Length(value, 256)
}

function isNormalizedSourcePath(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 512 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  )
}

function isExpectedAuthorityContext(input: CompatiblePreviewAuthorityContext): boolean {
  return (
    isBoundedIdentifier(input.tenantId) &&
    isBoundedIdentifier(input.projectId) &&
    isBoundedIdentifier(input.baseCommit) &&
    isNormalizedSourcePath(input.documentPath) &&
    isBoundedIdentifier(input.sessionId) &&
    Number.isSafeInteger(input.snapshotVersion) &&
    input.snapshotVersion > 0
  )
}

function authorityMatches(
  authority: SignedCompatiblePreviewResolution["authority"],
  expected: CompatiblePreviewAuthorityContext,
): boolean {
  return (
    authority.tenantId === expected.tenantId &&
    authority.projectId === expected.projectId &&
    authority.baseCommit === expected.baseCommit &&
    authority.documentPath === expected.documentPath &&
    authority.sessionId === expected.sessionId &&
    authority.snapshotVersion === expected.snapshotVersion
  )
}

/**
 * Cheap, allocation-bounded gate for an untrusted wire. Only strings cross
 * this API, so hostile objects/Proxies are rejected without touching traps.
 */
function preflightCompatibleResolutionWire(
  input: unknown,
  expected: CompatiblePreviewAuthorityContext,
): unknown | null {
  if (typeof input !== "string" || !isExpectedAuthorityContext(expected)) return null
  if (!boundedUtf8Length(input, COMPATIBLE_ARTIFACT_MAX_BYTES)) return null

  let decoded: unknown
  try {
    decoded = JSON.parse(input)
  } catch {
    return null
  }
  if (!isPlainRecord(decoded) || !isPlainRecord(decoded.authority) || !isPlainRecord(decoded.artifact)) return null

  const authority = decoded.authority
  for (const field of [
    "kind",
    "algorithm",
    "keyId",
    "approvalId",
    "tenantId",
    "projectId",
    "baseCommit",
    "sessionId",
    "rendererProfile",
    "executableDigest",
    "signature",
  ]) {
    if (!isBoundedIdentifier(authority[field])) return null
  }
  if (
    authority.rendererProfile !== COMPATIBLE_RENDERER_PROFILE ||
    authority.tenantId !== expected.tenantId ||
    authority.projectId !== expected.projectId ||
    authority.baseCommit !== expected.baseCommit ||
    authority.documentPath !== expected.documentPath ||
    authority.sessionId !== expected.sessionId ||
    authority.snapshotVersion !== expected.snapshotVersion
  ) {
    return null
  }

  const artifact = decoded.artifact
  if (!isBoundedIdentifier(artifact.artifactId) || typeof artifact.documentSource !== "string") return null
  const documentBytes = utf8LengthWithin(artifact.documentSource, COMPATIBLE_DOCUMENT_MAX_BYTES)
  if (documentBytes === null) return null
  let totalSourceBytes = documentBytes

  if (artifact.adapter !== null) {
    if (!isPlainRecord(artifact.adapter)) return null
    const entryPath = artifact.adapter.entryPath
    const sources = artifact.adapter.sources
    if (typeof entryPath !== "string" || !isNormalizedSourcePath(entryPath) || !isPlainRecord(sources)) return null

    let sourceCount = 0
    let hasEntry = false
    for (const sourcePath in sources) {
      if (!Object.hasOwn(sources, sourcePath)) continue
      sourceCount += 1
      if (sourceCount > COMPATIBLE_SOURCE_FILE_MAX_COUNT) return null
      if (!isNormalizedSourcePath(sourcePath)) return null
      if (sourcePath === entryPath) hasEntry = true
      const source = sources[sourcePath]
      if (typeof source !== "string") return null
      const sourceBytes = utf8LengthWithin(source, COMPATIBLE_ADAPTER_SOURCE_MAX_BYTES)
      if (sourceBytes === null) return null
      totalSourceBytes += sourceBytes
      if (totalSourceBytes > COMPATIBLE_SOURCE_TOTAL_MAX_BYTES) return null
    }
    if (!hasEntry) return null
  }

  return decoded
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalizeResolution(input: SignedCompatiblePreviewResolution): string {
  const sources = input.artifact.adapter?.sources
  const sortedSources = sources
    ? Object.fromEntries(Object.entries(sources).sort(([left], [right]) => compareCodeUnits(left, right)))
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

/**
 * The only wire representation used for signed compatible resolutions. Source
 * keys are ordered identically to executable-digest calculation so producers,
 * verifiers, and the transfer protocol cannot drift into separate formats.
 */
export function serializeSignedCompatiblePreviewResolution(input: SignedCompatiblePreviewResolution): string {
  const parsed = signedCompatiblePreviewResolutionSchema.parse(input)
  const wire = canonicalizeResolution(parsed)
  if (!boundedUtf8Length(wire, COMPATIBLE_ARTIFACT_MAX_BYTES)) {
    throw new RangeError("Compatible artifact exceeds the wire limit")
  }
  return wire
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
            Object.entries(sources ?? {}).sort(([left], [right]) => compareCodeUnits(left, right)),
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
  if (data.length === 0 || data.length > Math.ceil((COMPATIBLE_ARTIFACT_CHUNK_BYTES * 4) / 3)) return null
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
  if (decoded?.length !== 64) return null

  const zero = BigInt(0)
  const two = BigInt(2)
  const eight = BigInt(8)
  const readScalar = (offset: number) => {
    let value = zero
    for (let index = offset; index < offset + 32; index += 1) {
      value = (value << eight) | BigInt(decoded[index] ?? 0)
    }
    return value
  }
  const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")
  const r = readScalar(0)
  const s = readScalar(32)
  if (r === zero || r >= order || s === zero || s >= order || s > order / two) return null
  return decoded
}

export async function verifySignedCompatiblePreviewResolution(
  input: unknown,
  options: { publicKey: JsonWebKey; expectedAuthority: CompatiblePreviewAuthorityContext; now?: number },
): Promise<VerifiedCompatiblePreviewResolution | null> {
  const preflight = preflightCompatibleResolutionWire(input, options.expectedAuthority)
  if (!preflight) return null
  const parsed = signedCompatiblePreviewResolutionSchema.safeParse(preflight)
  if (!parsed.success) return null
  const resolution = parsed.data
  const now = options.now ?? Date.now()
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !authorityMatches(resolution.authority, options.expectedAuthority) ||
    resolution.authority.issuedAt > now + 30_000 ||
    resolution.authority.expiresAt <= now ||
    resolution.authority.expiresAt <= resolution.authority.issuedAt ||
    resolution.authority.expiresAt - resolution.authority.issuedAt > 5 * 60_000
  ) {
    return null
  }
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
    if (!valid) return null
    const digest = await computeCompatibleExecutableDigest(parsed.data.artifact)
    if (digest !== resolution.authority.executableDigest) return null
    const verified = deepFreeze(resolution) as VerifiedCompatiblePreviewResolution
    verifiedCompatibleResolutions.add(verified)
    return verified
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
  resolution: VerifiedCompatiblePreviewResolution
  expectedAuthority: CompatiblePreviewAuthorityContext
}): Promise<string[]> {
  const resolution = input.resolution
  if (
    !verifiedCompatibleResolutions.has(resolution) ||
    !authorityMatches(resolution.authority, input.expectedAuthority)
  ) {
    throw new TypeError("An authenticated, authority-bound compatible resolution is required")
  }
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
      sessionId: input.expectedAuthority.sessionId,
      snapshotVersion: input.expectedAuthority.snapshotVersion,
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
        sessionId: input.expectedAuthority.sessionId,
        snapshotVersion: input.expectedAuthority.snapshotVersion,
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
      sessionId: input.expectedAuthority.sessionId,
      snapshotVersion: input.expectedAuthority.snapshotVersion,
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
  if (input.byteLength === 0 || input.byteLength > COMPATIBLE_ARTIFACT_MAX_BYTES) return null
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(input)
    const shallow = JSON.parse(decoded) as unknown
    if (!isPlainRecord(shallow) || !isPlainRecord(shallow.authority)) return null
    const expectedAuthority: CompatiblePreviewAuthorityContext = {
      tenantId: String(shallow.authority.tenantId ?? ""),
      projectId: String(shallow.authority.projectId ?? ""),
      baseCommit: String(shallow.authority.baseCommit ?? ""),
      documentPath: String(shallow.authority.documentPath ?? ""),
      sessionId: String(shallow.authority.sessionId ?? ""),
      snapshotVersion: Number(shallow.authority.snapshotVersion),
    }
    const preflight = preflightCompatibleResolutionWire(decoded, expectedAuthority)
    if (!preflight) return null
    const parsed = signedCompatiblePreviewResolutionSchema.safeParse(preflight)
    return parsed.success ? deepFreeze(parsed.data) : null
  } catch {
    return null
  }
}
