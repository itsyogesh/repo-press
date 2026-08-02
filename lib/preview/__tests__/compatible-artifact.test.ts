import { describe, expect, it, vi } from "vitest"
import {
  COMPATIBLE_ARTIFACT_MAX_BYTES,
  parseCompatibleTransferCommand,
  serializeCompatibleArtifactTransfer,
  serializeSignedCompatiblePreviewResolution,
  signedCompatiblePreviewResolutionSchema,
  verifySignedCompatiblePreviewResolution,
  verifySignedCompatiblePreviewResolutionDetailed,
} from "../compatible-artifact"
import { createSignedCompatibleFixture } from "./compatible-test-fixture"

const P256_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")
const BIGINT_ZERO = BigInt(0)
const BIGINT_ONE = BigInt(1)
const BIGINT_TWO = BigInt(2)
const BIGINT_EIGHT = BigInt(8)
const BIGINT_BYTE_MASK = BigInt(255)

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

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

describe("compatible artifact transport", () => {
  const expectedAuthority = {
    tenantId: "tenant-1",
    projectId: "project-1",
    baseCommit: "abc123",
    documentPath: "content/example.mdx",
    sessionId: "session-1",
    snapshotVersion: 1,
  }

  it("rejects control characters in signed repository paths", async () => {
    const fixture = await createSignedCompatibleFixture()
    const withUnsafeDocumentPath = {
      ...fixture.resolution,
      authority: { ...fixture.resolution.authority, documentPath: "content/unsafe\u001f.mdx" },
    }
    const withUnsafeAdapterPath = {
      ...fixture.resolution,
      artifact: {
        ...fixture.resolution.artifact,
        adapter: {
          entryPath: "adapter\u0085.tsx",
          sources: { "adapter\u0085.tsx": "export const adapter = {}" },
        },
      },
    }

    expect(signedCompatiblePreviewResolutionSchema.safeParse(withUnsafeDocumentPath).success).toBe(false)
    expect(signedCompatiblePreviewResolutionSchema.safeParse(withUnsafeAdapterPath).success).toBe(false)
  })

  it("uses one canonical source ordering for signed resolution wires", async () => {
    const fixture = await createSignedCompatibleFixture({
      adapter: {
        entryPath: "z-entry.tsx",
        sources: {
          "z-entry.tsx": "export default {}",
          "a-helper.ts": "export const helper = true",
        },
      },
    })

    const wire = serializeSignedCompatiblePreviewResolution(fixture.resolution)
    const decoded = JSON.parse(wire)
    expect(Object.keys(decoded.artifact.adapter.sources)).toEqual(["a-helper.ts", "z-entry.tsx"])
  })

  it("requires an independently supplied exact authority context", async () => {
    const { wire, publicKey } = await createSignedCompatibleFixture()

    expect(
      await verifySignedCompatiblePreviewResolution(wire, {
        publicKey,
        expectedAuthority,
      }),
    ).not.toBeNull()

    for (const mismatch of [
      { tenantId: "tenant-2" },
      { projectId: "project-2" },
      { baseCommit: "def456" },
      { documentPath: "content/other.mdx" },
      { sessionId: "session-2" },
      { snapshotVersion: 2 },
    ]) {
      expect(
        await verifySignedCompatiblePreviewResolution(wire, {
          publicKey,
          expectedAuthority: { ...expectedAuthority, ...mismatch },
        }),
      ).toBeNull()
    }
  })

  it("requires the signed static-inert-v1 renderer profile", async () => {
    const approved = await createSignedCompatibleFixture()
    const missing = await createSignedCompatibleFixture({ rendererProfile: null })
    const wrong = await createSignedCompatibleFixture({ rendererProfile: "unsupported-profile" })

    await expect(
      verifySignedCompatiblePreviewResolution(approved.wire, {
        publicKey: approved.publicKey,
        expectedAuthority,
      }),
    ).resolves.not.toBeNull()
    for (const fixture of [missing, wrong]) {
      await expect(
        verifySignedCompatiblePreviewResolution(fixture.wire, {
          publicKey: fixture.publicKey,
          expectedAuthority,
        }),
      ).resolves.toBeNull()
    }
  })

  it("rejects a structurally valid self-signed resolution from an untrusted key", async () => {
    const trusted = await createSignedCompatibleFixture()
    const forged = await createSignedCompatibleFixture()

    expect(
      await verifySignedCompatiblePreviewResolution(forged.wire, {
        publicKey: trusted.publicKey,
        expectedAuthority,
      }),
    ).toBeNull()
  })

  it("reports fail-closed verification phases without exposing artifact contents", async () => {
    const trusted = await createSignedCompatibleFixture()
    const forged = await createSignedCompatibleFixture()
    const expired = await createSignedCompatibleFixture({
      issuedAt: Date.now() - 120_000,
      expiresAt: Date.now() - 60_000,
    })
    const swapped = {
      ...trusted.resolution,
      artifact: { ...trusted.resolution.artifact, documentSource: "# Changed after approval" },
    }

    await expect(
      verifySignedCompatiblePreviewResolutionDetailed(forged.wire, {
        publicKey: trusted.publicKey,
        expectedAuthority,
      }),
    ).resolves.toEqual({ ok: false, reason: "SIGNATURE_INVALID" })
    await expect(
      verifySignedCompatiblePreviewResolutionDetailed(expired.wire, {
        publicKey: expired.publicKey,
        expectedAuthority,
      }),
    ).resolves.toEqual({ ok: false, reason: "APPROVAL_EXPIRED" })
    await expect(
      verifySignedCompatiblePreviewResolutionDetailed(JSON.stringify(swapped), {
        publicKey: trusted.publicKey,
        expectedAuthority,
      }),
    ).resolves.toEqual({ ok: false, reason: "DIGEST_MISMATCH" })
  })

  it("rejects the constructed high-S twin of an otherwise valid raw P-256 signature before Web Crypto", async () => {
    const fixture = await createSignedCompatibleFixture()
    await expect(
      verifySignedCompatiblePreviewResolution(fixture.wire, {
        publicKey: fixture.publicKey,
        expectedAuthority,
      }),
    ).resolves.not.toBeNull()

    const twinSignature = decodeBase64Url(fixture.resolution.authority.signature)
    const lowS = readScalar(twinSignature, 32)
    expect(lowS).toBeGreaterThan(BIGINT_ZERO)
    expect(lowS).toBeLessThanOrEqual(P256_ORDER / BIGINT_TWO)
    writeScalar(twinSignature, 32, P256_ORDER - lowS)
    const twin = {
      ...fixture.resolution,
      authority: { ...fixture.resolution.authority, signature: base64Url(twinSignature) },
    }
    const verify = vi.spyOn(crypto.subtle, "verify")
    verify.mockClear()

    await expect(
      verifySignedCompatiblePreviewResolution(JSON.stringify(twin), {
        publicKey: fixture.publicKey,
        expectedAuthority,
      }),
    ).resolves.toBeNull()
    expect(verify).not.toHaveBeenCalled()
  })

  it("rejects malformed raw P-256 scalar encodings before Web Crypto", async () => {
    const fixture = await createSignedCompatibleFixture()
    const scalarSignature = (r: bigint, s: bigint) => {
      const bytes = new Uint8Array(64)
      writeScalar(bytes, 0, r)
      writeScalar(bytes, 32, s)
      return base64Url(bytes)
    }
    const invalidSignatures = [
      base64Url(new Uint8Array(63)),
      base64Url(new Uint8Array(65)),
      scalarSignature(BIGINT_ZERO, BIGINT_ONE),
      scalarSignature(P256_ORDER, BIGINT_ONE),
      scalarSignature(BIGINT_ONE, BIGINT_ZERO),
      scalarSignature(BIGINT_ONE, P256_ORDER),
    ]
    const verify = vi.spyOn(crypto.subtle, "verify")
    verify.mockClear()

    for (const signature of invalidSignatures) {
      const invalid = {
        ...fixture.resolution,
        authority: { ...fixture.resolution.authority, signature },
      }
      await expect(
        verifySignedCompatiblePreviewResolution(JSON.stringify(invalid), {
          publicKey: fixture.publicKey,
          expectedAuthority,
        }),
      ).resolves.toBeNull()
    }
    expect(verify).not.toHaveBeenCalled()
  })

  it("recomputes the executable digest and rejects source swapped under old approval metadata", async () => {
    const { resolution, publicKey } = await createSignedCompatibleFixture({ documentSource: "# Approved" })
    const swapped = { ...resolution, artifact: { ...resolution.artifact, documentSource: "# Swapped" } }

    expect(
      await verifySignedCompatiblePreviewResolution(JSON.stringify(swapped), {
        publicKey,
        expectedAuthority,
      }),
    ).toBeNull()
    await expect(
      serializeCompatibleArtifactTransfer({
        resolution: swapped as never,
        expectedAuthority,
      }),
    ).rejects.toThrow("authority-bound")
  })

  it("deep-freezes verified source graphs and emits strict contiguous transfer commands", async () => {
    const { wire, publicKey } = await createSignedCompatibleFixture({ documentSource: "# Approved" })
    const verified = await verifySignedCompatiblePreviewResolution(wire, {
      publicKey,
      expectedAuthority,
    })
    expect(verified).not.toBeNull()
    expect(Object.isFrozen(verified)).toBe(true)
    expect(Object.isFrozen(verified?.authority)).toBe(true)
    expect(Object.isFrozen(verified?.artifact)).toBe(true)

    const wires = await serializeCompatibleArtifactTransfer({
      resolution: verified as NonNullable<typeof verified>,
      expectedAuthority,
    })
    const commands = wires.map(parseCompatibleTransferCommand)
    expect(commands.every(Boolean)).toBe(true)
    expect(commands.map((command) => command?.sequence)).toEqual(commands.map((_, index) => index + 1))
    expect(commands[0]?.type).toBe("repopress:artifact-start")
    expect(commands.at(-1)?.type).toBe("repopress:artifact-commit")
  })

  it("never brands a source closure over the pre-auth budget", async () => {
    const { resolution, publicKey } = await createSignedCompatibleFixture({
      documentSource: "x".repeat(COMPATIBLE_ARTIFACT_MAX_BYTES),
    })
    await expect(
      verifySignedCompatiblePreviewResolution(JSON.stringify(resolution), { publicKey, expectedAuthority }),
    ).resolves.toBeNull()
  })

  it("refuses oversized source before invoking Web Crypto digest work", async () => {
    const { resolution, publicKey } = await createSignedCompatibleFixture()
    const digest = vi.spyOn(crypto.subtle, "digest")
    digest.mockClear()
    const oversized = JSON.stringify({
      ...resolution,
      artifact: {
        ...resolution.artifact,
        documentSource: "x".repeat(COMPATIBLE_ARTIFACT_MAX_BYTES + 1),
      },
    })

    await expect(
      verifySignedCompatiblePreviewResolution(oversized, {
        publicKey,
        expectedAuthority,
      }),
    ).resolves.toBeNull()
    expect(digest).not.toHaveBeenCalled()
  })

  it("refuses a 65-file source graph before invoking Web Crypto digest work", async () => {
    const { resolution, publicKey } = await createSignedCompatibleFixture()
    const digest = vi.spyOn(crypto.subtle, "digest")
    digest.mockClear()
    const sources = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`source-${index}.tsx`, "export default null"]),
    )
    const tooManySources = JSON.stringify({
      ...resolution,
      artifact: {
        ...resolution.artifact,
        adapter: { entryPath: "source-0.tsx", sources },
      },
    })

    await expect(
      verifySignedCompatiblePreviewResolution(tooManySources, {
        publicKey,
        expectedAuthority,
      }),
    ).resolves.toBeNull()
    expect(digest).not.toHaveBeenCalled()
  })

  it("rejects hostile object proxies without touching their traps", async () => {
    const { publicKey } = await createSignedCompatibleFixture()
    let traps = 0
    const hostile = new Proxy(
      {},
      {
        get() {
          traps += 1
          throw new Error("getter trap")
        },
        ownKeys() {
          traps += 1
          throw new Error("enumeration trap")
        },
        getOwnPropertyDescriptor() {
          traps += 1
          throw new Error("descriptor trap")
        },
      },
    )

    await expect(
      verifySignedCompatiblePreviewResolution(hostile, {
        publicKey,
        expectedAuthority,
      }),
    ).resolves.toBeNull()
    expect(traps).toBe(0)
  })
})
