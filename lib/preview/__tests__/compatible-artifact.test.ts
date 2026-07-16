import { describe, expect, it } from "vitest"
import {
  COMPATIBLE_ARTIFACT_MAX_BYTES,
  parseCompatibleTransferCommand,
  serializeCompatibleArtifactTransfer,
  verifySignedCompatiblePreviewResolution,
} from "../compatible-artifact"
import { createSignedCompatibleFixture } from "./compatible-test-fixture"

describe("compatible artifact transport", () => {
  it("rejects a structurally valid self-signed resolution from an untrusted key", async () => {
    const trusted = await createSignedCompatibleFixture()
    const forged = await createSignedCompatibleFixture()

    expect(
      await verifySignedCompatiblePreviewResolution(forged.resolution, {
        publicKey: trusted.publicKey,
        expectedSessionId: "session-1",
        expectedSnapshotVersion: 1,
      }),
    ).toBeNull()
  })

  it("recomputes the executable digest and rejects source swapped under old approval metadata", async () => {
    const { resolution, publicKey } = await createSignedCompatibleFixture({ documentSource: "# Approved" })
    const swapped = { ...resolution, artifact: { ...resolution.artifact, documentSource: "# Swapped" } }

    expect(
      await verifySignedCompatiblePreviewResolution(swapped, {
        publicKey,
        expectedSessionId: "session-1",
        expectedSnapshotVersion: 1,
      }),
    ).toBeNull()
    await expect(
      serializeCompatibleArtifactTransfer({
        resolution: swapped,
        publicKey,
        sessionId: "session-1",
        snapshotVersion: 1,
      }),
    ).rejects.toThrow("digest-bound")
  })

  it("deep-freezes verified source graphs and emits strict contiguous transfer commands", async () => {
    const { resolution, publicKey } = await createSignedCompatibleFixture({ documentSource: "# Approved" })
    const verified = await verifySignedCompatiblePreviewResolution(resolution, {
      publicKey,
      expectedSessionId: "session-1",
      expectedSnapshotVersion: 1,
    })
    expect(verified).not.toBeNull()
    expect(Object.isFrozen(verified)).toBe(true)
    expect(Object.isFrozen(verified?.authority)).toBe(true)
    expect(Object.isFrozen(verified?.artifact)).toBe(true)

    const wires = await serializeCompatibleArtifactTransfer({
      resolution,
      publicKey,
      sessionId: "session-1",
      snapshotVersion: 1,
    })
    const commands = wires.map(parseCompatibleTransferCommand)
    expect(commands.every(Boolean)).toBe(true)
    expect(commands.map((command) => command?.sequence)).toEqual(commands.map((_, index) => index + 1))
    expect(commands[0]?.type).toBe("repopress:artifact-start")
    expect(commands.at(-1)?.type).toBe("repopress:artifact-commit")
  })

  it("rejects a source closure over the total transfer budget before chunking", async () => {
    const { resolution, publicKey } = await createSignedCompatibleFixture({
      documentSource: "x".repeat(COMPATIBLE_ARTIFACT_MAX_BYTES),
    })
    await expect(
      serializeCompatibleArtifactTransfer({ resolution, publicKey, sessionId: "session-1", snapshotVersion: 1 }),
    ).rejects.toThrow("transfer limit")
  })
})
