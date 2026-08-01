import "server-only"

import { z } from "zod"
import {
  assertCompatibleSourceArtifactWithinBounds,
  COMPATIBLE_RENDERER_PROFILE,
  type CompatiblePreviewAuthorityContext,
  type CompatibleSourceArtifact,
  compatiblePreviewAuthorityContextSchema,
  compatibleSourceArtifactSchema,
  computeCompatibleExecutableDigest,
  createCompatibleApprovalPayload,
  type SignedCompatiblePreviewResolution,
  signedCompatiblePreviewResolutionSchema,
} from "./compatible-artifact"

const PRIVATE_JWK_MAX_BYTES = 4_096
const APPROVAL_LIFETIME_MS = 5 * 60_000
const P256_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")
const privateScalarSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)
const privateJwkSchema = z
  .object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: privateScalarSchema,
    y: privateScalarSchema,
    d: privateScalarSchema,
    key_ops: z.array(z.string()).refine((operations) => operations.includes("sign")),
    ext: z.boolean().optional(),
    alg: z.literal("ES256").optional(),
  })
  .passthrough()

export class CompatiblePreviewSigningUnavailableError extends Error {
  constructor() {
    super("Compatible preview signing is unavailable")
    this.name = "CompatiblePreviewSigningUnavailableError"
  }
}

function deepFreeze<T>(input: T): T {
  if (input !== null && typeof input === "object" && !Object.isFrozen(input)) {
    for (const key of Object.keys(input)) deepFreeze(Object.getOwnPropertyDescriptor(input, key)?.value)
    Object.freeze(input)
  }
  return input
}

function parseConfiguredPrivateKey(input: string | undefined): JsonWebKey | null {
  if (!input || input.length > PRIVATE_JWK_MAX_BYTES) return null
  try {
    const parsed = privateJwkSchema.safeParse(JSON.parse(input))
    if (!parsed.success) return null
    return {
      kty: "EC",
      crv: "P-256",
      x: parsed.data.x,
      y: parsed.data.y,
      d: parsed.data.d,
      key_ops: ["sign"],
      ext: false,
      ...(parsed.data.alg ? { alg: parsed.data.alg } : {}),
    }
  } catch {
    return null
  }
}

function readScalar(bytes: Uint8Array, offset: number): bigint {
  let value = BigInt(0)
  for (let index = offset; index < offset + 32; index += 1) {
    value = (value << BigInt(8)) | BigInt(bytes[index] ?? 0)
  }
  return value
}

function writeScalar(bytes: Uint8Array, offset: number, value: bigint): void {
  let remaining = value
  for (let index = offset + 31; index >= offset; index -= 1) {
    bytes[index] = Number(remaining & BigInt(255))
    remaining >>= BigInt(8)
  }
}

function canonicalizeSignature(input: ArrayBuffer): Uint8Array {
  const signature = new Uint8Array(input)
  if (signature.length !== 64) throw new CompatiblePreviewSigningUnavailableError()
  const s = readScalar(signature, 32)
  if (s <= BigInt(0) || s >= P256_ORDER) throw new CompatiblePreviewSigningUnavailableError()
  if (s > P256_ORDER / BigInt(2)) writeScalar(signature, 32, P256_ORDER - s)
  return signature
}

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export async function signCompatiblePreviewResolution(input: {
  artifact: CompatibleSourceArtifact
  authority: CompatiblePreviewAuthorityContext
  approvalId: string
  keyId: string
  now?: number
}): Promise<SignedCompatiblePreviewResolution> {
  const artifact = compatibleSourceArtifactSchema.parse(input.artifact)
  assertCompatibleSourceArtifactWithinBounds(artifact)
  const authorityContext = compatiblePreviewAuthorityContextSchema.parse(input.authority)
  const identifiers = z
    .object({ approvalId: z.string().min(1).max(256), keyId: z.string().min(1).max(256) })
    .strict()
    .parse({ approvalId: input.approvalId, keyId: input.keyId })
  const issuedAt = input.now ?? Date.now()
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 0 || issuedAt > Number.MAX_SAFE_INTEGER - APPROVAL_LIFETIME_MS) {
    throw new TypeError("Compatible preview signing time is invalid")
  }

  const privateJwk = parseConfiguredPrivateKey(process.env.PREVIEW_APPROVAL_PRIVATE_KEY_JWK)
  if (!privateJwk || !globalThis.crypto?.subtle) throw new CompatiblePreviewSigningUnavailableError()

  try {
    const executableDigest = await computeCompatibleExecutableDigest(artifact)
    const authorityWithoutSignature = {
      kind: "signed-preview-resolution" as const,
      algorithm: "ECDSA-P256-SHA256" as const,
      keyId: identifiers.keyId,
      approvalId: identifiers.approvalId,
      ...authorityContext,
      rendererProfile: COMPATIBLE_RENDERER_PROFILE,
      issuedAt,
      expiresAt: issuedAt + APPROVAL_LIFETIME_MS,
      executableDigest,
    }
    const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
      "sign",
    ])
    const rawSignature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      createCompatibleApprovalPayload({ authority: authorityWithoutSignature, artifact }) as BufferSource,
    )
    const parsed = signedCompatiblePreviewResolutionSchema.parse({
      authority: { ...authorityWithoutSignature, signature: base64Url(canonicalizeSignature(rawSignature)) },
      artifact,
    })
    return deepFreeze(parsed)
  } catch (error) {
    if (error instanceof CompatiblePreviewSigningUnavailableError) throw error
    throw new CompatiblePreviewSigningUnavailableError()
  }
}
