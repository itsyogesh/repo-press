import { afterEach, describe, expect, it, vi } from "vitest"
import { COMPATIBLE_ADAPTER_SOURCE_MAX_BYTES, verifySignedCompatiblePreviewResolution } from "../compatible-artifact"
import { signCompatiblePreviewResolution } from "../compatible-signing.server"

vi.mock("server-only", () => ({}))

const BASE_COMMIT = "b".repeat(40)
const P256_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")

function decodeBase64Url(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

function readScalar(bytes: Uint8Array, offset: number): bigint {
  let value = BigInt(0)
  for (let index = offset; index < offset + 32; index += 1) value = (value << BigInt(8)) | BigInt(bytes[index] ?? 0)
  return value
}

async function privateJwk(): Promise<JsonWebKey> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair
  return crypto.subtle.exportKey("jwk", pair.privateKey)
}

const artifact = {
  artifactId: "artifact-1",
  documentSource: "# Merry",
  adapter: {
    entryPath: ".repopress/mdx-preview.tsx",
    sources: {
      ".repopress/mdx-preview.tsx": "export const adapter = { components: {} }",
    },
  },
}

const authority = {
  tenantId: "tenant-1",
  projectId: "project-1",
  baseCommit: BASE_COMMIT,
  documentPath: "content/merry.mdx",
  sessionId: "session-1",
  snapshotVersion: 4,
}

describe("compatible preview signer", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("signs a low-S raw P-256 resolution that the browser verifier accepts", async () => {
    const jwk = await privateJwk()
    vi.stubEnv("PREVIEW_APPROVAL_PRIVATE_KEY_JWK", JSON.stringify(jwk))
    const now = 1_750_000_000_000

    const resolution = await signCompatiblePreviewResolution({
      artifact,
      authority,
      approvalId: "approval-1",
      keyId: "preview-key-1",
      now,
    })

    const signature = decodeBase64Url(resolution.authority.signature)
    expect(signature).toHaveLength(64)
    expect(readScalar(signature, 32)).toBeLessThanOrEqual(P256_ORDER / BigInt(2))
    expect(resolution.authority.issuedAt).toBe(now)
    expect(resolution.authority.expiresAt - resolution.authority.issuedAt).toBeLessThanOrEqual(5 * 60_000)

    const publicJwk = { ...jwk, d: undefined, key_ops: ["verify"] }
    await expect(
      verifySignedCompatiblePreviewResolution(JSON.stringify(resolution), {
        publicKey: publicJwk,
        expectedAuthority: authority,
        now,
      }),
    ).resolves.not.toBeNull()
  })

  it.each([
    ["missing configuration", undefined],
    ["malformed JSON", "{"],
    ["oversized material", "x".repeat(4_097)],
    ["a public-only key", { kty: "EC", crv: "P-256", x: "x", y: "y", key_ops: ["verify"] }],
    ["the wrong curve", { kty: "EC", crv: "P-384", x: "x", y: "y", d: "private", key_ops: ["sign"] }],
    ["a key without sign capability", { kty: "EC", crv: "P-256", x: "x", y: "y", d: "private", key_ops: [] }],
  ])("fails closed for %s", async (_label, configuredKey) => {
    if (typeof configuredKey === "string") vi.stubEnv("PREVIEW_APPROVAL_PRIVATE_KEY_JWK", configuredKey)
    else if (configuredKey) vi.stubEnv("PREVIEW_APPROVAL_PRIVATE_KEY_JWK", JSON.stringify(configuredKey))
    else vi.stubEnv("PREVIEW_APPROVAL_PRIVATE_KEY_JWK", "")

    await expect(
      signCompatiblePreviewResolution({
        artifact,
        authority,
        approvalId: "approval-1",
        keyId: "preview-key-1",
      }),
    ).rejects.toThrow("Compatible preview signing is unavailable")
  })

  it("binds every authority and executable field into the signature", async () => {
    const jwk = await privateJwk()
    vi.stubEnv("PREVIEW_APPROVAL_PRIVATE_KEY_JWK", JSON.stringify(jwk))
    const now = 1_750_000_000_000
    const resolution = await signCompatiblePreviewResolution({
      artifact,
      authority,
      approvalId: "approval-1",
      keyId: "preview-key-1",
      now,
    })
    const publicKey = { ...jwk, d: undefined, key_ops: ["verify"] }

    const mutations = [
      { ...resolution, artifact: { ...resolution.artifact, documentSource: "# Changed" } },
      {
        ...resolution,
        artifact: {
          ...resolution.artifact,
          adapter: {
            ...resolution.artifact.adapter,
            entryPath: ".repopress/mdx-preview.tsx",
            sources: { ".repopress/mdx-preview.tsx": "export const changed = true" },
          },
        },
      },
      { ...resolution, authority: { ...resolution.authority, projectId: "project-2" } },
      { ...resolution, authority: { ...resolution.authority, baseCommit: "c".repeat(40) } },
      { ...resolution, authority: { ...resolution.authority, documentPath: "content/other.mdx" } },
      { ...resolution, authority: { ...resolution.authority, sessionId: "session-2" } },
      { ...resolution, authority: { ...resolution.authority, snapshotVersion: 5 } },
      { ...resolution, authority: { ...resolution.authority, expiresAt: resolution.authority.expiresAt - 1 } },
      { ...resolution, authority: { ...resolution.authority, rendererProfile: "other-profile" } },
    ]

    for (const mutation of mutations) {
      await expect(
        verifySignedCompatiblePreviewResolution(JSON.stringify(mutation), {
          publicKey,
          expectedAuthority: authority,
          now,
        }),
      ).resolves.toBeNull()
    }
  })

  it("rejects unsafe signing inputs before importing the private key", async () => {
    vi.stubEnv("PREVIEW_APPROVAL_PRIVATE_KEY_JWK", JSON.stringify(await privateJwk()))
    await expect(
      signCompatiblePreviewResolution({
        artifact,
        authority: { ...authority, snapshotVersion: 0 },
        approvalId: "approval-1",
        keyId: "preview-key-1",
      }),
    ).rejects.toThrow()
  })

  it("refuses to sign source outside the verifier's executable budgets", async () => {
    vi.stubEnv("PREVIEW_APPROVAL_PRIVATE_KEY_JWK", JSON.stringify(await privateJwk()))

    await expect(
      signCompatiblePreviewResolution({
        artifact: {
          ...artifact,
          adapter: {
            entryPath: ".repopress/mdx-preview.tsx",
            sources: {
              ".repopress/mdx-preview.tsx": "x".repeat(COMPATIBLE_ADAPTER_SOURCE_MAX_BYTES + 1),
            },
          },
        },
        authority,
        approvalId: "approval-1",
        keyId: "preview-key-1",
      }),
    ).rejects.toThrow("Compatible source artifact exceeds its executable budget")
  })
})
