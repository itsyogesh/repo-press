import {
  computeCompatibleExecutableDigest,
  createCompatibleApprovalPayload,
  type SignedCompatiblePreviewResolution,
} from "../compatible-artifact"

function base64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export async function createSignedCompatibleFixture(options?: {
  sessionId?: string
  snapshotVersion?: number
  documentSource?: string
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
    adapter: null,
  }
  const now = Date.now()
  const authorityWithoutSignature = {
    kind: "signed-preview-resolution" as const,
    algorithm: "ECDSA-P256-SHA256" as const,
    keyId: "test-key",
    approvalId: "approval-1",
    tenantId: "tenant-1",
    projectId: "project-1",
    baseCommit: "abc123",
    sessionId: options?.sessionId ?? "session-1",
    snapshotVersion: options?.snapshotVersion ?? 1,
    issuedAt: now,
    expiresAt: now + 60_000,
    executableDigest: await computeCompatibleExecutableDigest(artifact),
  }
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    createCompatibleApprovalPayload({ authority: authorityWithoutSignature, artifact }) as BufferSource,
  )
  const resolution: SignedCompatiblePreviewResolution = {
    authority: { ...authorityWithoutSignature, signature: base64Url(new Uint8Array(signature)) },
    artifact,
  }
  return { resolution, publicKey, privateKey: keyPair.privateKey, keyPair }
}
