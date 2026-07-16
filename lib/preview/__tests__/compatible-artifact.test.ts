import { describe, expect, it, vi } from "vitest"
import {
  COMPATIBLE_ARTIFACT_MAX_BYTES,
  parseCompatibleTransferCommand,
  serializeCompatibleArtifactTransfer,
  verifySignedCompatiblePreviewResolution,
} from "../compatible-artifact"
import { createSignedCompatibleFixture } from "./compatible-test-fixture"

describe("compatible artifact transport", () => {
  const expectedAuthority = {
    tenantId: "tenant-1",
    projectId: "project-1",
    baseCommit: "abc123",
    sessionId: "session-1",
    snapshotVersion: 1,
  }

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
