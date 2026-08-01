import {
  type CompatibleSourceArtifact,
  computeCompatibleExecutableDigest,
  createCompatibleApprovalPayload,
  type SignedCompatiblePreviewResolution,
} from "../compatible-artifact"

function base64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

const P256_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")
const BIGINT_ZERO = BigInt(0)
const BIGINT_TWO = BigInt(2)
const BIGINT_EIGHT = BigInt(8)
const BIGINT_BYTE_MASK = BigInt(255)

function readScalar(bytes: Uint8Array, offset: number): bigint {
  let value = BIGINT_ZERO
  for (let index = offset; index < offset + 32; index += 1) {
    value = (value << BIGINT_EIGHT) | BigInt(bytes[index])
  }
  return value
}

function writeScalar(bytes: Uint8Array, offset: number, value: bigint): void {
  let remaining = value
  for (let index = offset + 31; index >= offset; index -= 1) {
    bytes[index] = Number(remaining & BIGINT_BYTE_MASK)
    remaining >>= BIGINT_EIGHT
  }
}

function canonicalizeP256Signature(input: ArrayBuffer): Uint8Array {
  const signature = new Uint8Array(input)
  if (signature.length !== 64) throw new Error("Expected a raw P-256 signature")
  const s = readScalar(signature, 32)
  if (s > P256_ORDER / BIGINT_TWO) writeScalar(signature, 32, P256_ORDER - s)
  return signature
}

export async function createSignedCompatibleFixture(options?: {
  keyId?: string
  approvalId?: string
  tenantId?: string
  projectId?: string
  baseCommit?: string
  documentPath?: string
  sessionId?: string
  snapshotVersion?: number
  documentSource?: string
  adapter?: CompatibleSourceArtifact["adapter"]
  rendererProfile?: "static-inert-v1" | "unsupported-profile" | null
  issuedAt?: number
  expiresAt?: number
  keyPair?: CryptoKeyPair
}) {
  const keyPair =
    options?.keyPair ??
    ((await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair)
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey)
  const artifact = {
    artifactId: "artifact-1",
    documentSource: options?.documentSource ?? "# Isolated",
    adapter: options?.adapter ?? null,
  }
  const issuedAt = options?.issuedAt ?? Date.now()
  const rendererProfile = options?.rendererProfile === undefined ? "static-inert-v1" : options.rendererProfile
  const authorityWithoutSignature = {
    kind: "signed-preview-resolution" as const,
    algorithm: "ECDSA-P256-SHA256" as const,
    keyId: options?.keyId ?? "test-key",
    approvalId: options?.approvalId ?? "approval-1",
    tenantId: options?.tenantId ?? "tenant-1",
    projectId: options?.projectId ?? "project-1",
    baseCommit: options?.baseCommit ?? "abc123",
    documentPath: options?.documentPath ?? "content/example.mdx",
    sessionId: options?.sessionId ?? "session-1",
    snapshotVersion: options?.snapshotVersion ?? 1,
    ...(rendererProfile === null ? {} : { rendererProfile }),
    issuedAt,
    expiresAt: options?.expiresAt ?? issuedAt + 60_000,
    executableDigest: await computeCompatibleExecutableDigest(artifact),
  }
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    createCompatibleApprovalPayload({ authority: authorityWithoutSignature as never, artifact }) as BufferSource,
  )
  const resolution = {
    authority: { ...authorityWithoutSignature, signature: base64Url(canonicalizeP256Signature(signature)) },
    artifact,
  } as unknown as SignedCompatiblePreviewResolution
  return {
    resolution,
    wire: JSON.stringify(resolution),
    expectedAuthority: {
      tenantId: authorityWithoutSignature.tenantId,
      projectId: authorityWithoutSignature.projectId,
      baseCommit: authorityWithoutSignature.baseCommit,
      documentPath: authorityWithoutSignature.documentPath,
      sessionId: authorityWithoutSignature.sessionId,
      snapshotVersion: authorityWithoutSignature.snapshotVersion,
    },
    publicKey,
    privateKey: keyPair.privateKey,
    keyPair,
  }
}
