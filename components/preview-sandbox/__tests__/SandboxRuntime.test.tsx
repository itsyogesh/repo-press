import { render, screen, waitFor } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { createSignedCompatibleFixture } from "@/lib/preview/__tests__/compatible-test-fixture"
import {
  COMPATIBLE_COMMAND_RATE_BURST,
  type CompatiblePreviewAuthorityContext,
  serializeCompatibleArtifactTransfer,
  type VerifiedCompatiblePreviewResolution,
  verifySignedCompatiblePreviewResolution,
} from "@/lib/preview/compatible-artifact"
import {
  advanceSandboxSequence,
  createSandboxSessionState,
  validateSandboxMessage,
} from "@/lib/preview/sandbox-protocol"
import { createSandboxRuntimeBridge, SandboxRuntime } from "../SandboxRuntime"

class FakePort {
  closed = false
  onmessage: ((event: MessageEvent) => void) | null = null
  sent: string[] = []
  started = false

  close() {
    this.closed = true
  }

  postMessage(message: string) {
    this.sent.push(message)
  }

  start() {
    this.started = true
  }

  emit(message: unknown) {
    this.onmessage?.({ data: message } as MessageEvent)
  }
}

let serverResolution: VerifiedCompatiblePreviewResolution
let authorityContext: CompatiblePreviewAuthorityContext

beforeAll(async () => {
  const fixture = await createSignedCompatibleFixture({ sessionId: "session-1", snapshotVersion: 3 })
  authorityContext = fixture.expectedAuthority
  const verified = await verifySignedCompatiblePreviewResolution(fixture.wire, {
    publicKey: fixture.publicKey,
    expectedAuthority: fixture.expectedAuthority,
  })
  if (!verified) throw new Error("Expected sandbox fixture to verify")
  serverResolution = verified
})

describe("SandboxRuntime", () => {
  it("renders only the RepoPress-owned inert Task 9 shell", () => {
    const { container } = render(<SandboxRuntime />)

    const main = container.querySelector("main")
    expect(main).not.toBeNull()
    expect(main).not.toHaveClass("p-6")
    expect(screen.getByText("Compatible preview sandbox ready.")).toHaveAttribute(
      "data-repopress-sandbox-shell",
      "inert",
    )
    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("[dangerouslySetInnerHTML]")).toBeNull()
  })

  it("accepts a serialized parent offer and emits serialized ready and teardown messages over the port", () => {
    const listeners = new Set<(event: MessageEvent) => void>()
    const sandboxWindow = {
      addEventListener: (_type: "message", listener: (event: MessageEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: "message", listener: (event: MessageEvent) => void) => listeners.delete(listener),
    }
    const parentWindow = { postMessage: vi.fn() }
    const port = new FakePort()
    const bridge = createSandboxRuntimeBridge({ sandboxWindow, parentWindow })
    const offer = {
      protocolVersion: 1,
      type: "repopress:bootstrap-offer",
      sessionId: "session-1",
      snapshotVersion: 3,
      capability: "A".repeat(43),
    }

    bridge.start()
    expect(listeners.size).toBe(1)
    expect(bridge.receiveWindowMessage({ data: offer, source: parentWindow, ports: [] })).toBe(false)
    expect(parentWindow.postMessage).not.toHaveBeenCalled()
    expect(
      bridge.receiveWindowMessage({ data: JSON.stringify(offer), source: { postMessage: vi.fn() }, ports: [] }),
    ).toBe(false)

    expect(bridge.receiveWindowMessage({ data: JSON.stringify(offer), source: parentWindow, ports: [] })).toBe(true)
    expect(parentWindow.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ ...offer, type: "repopress:bootstrap-accept" }),
      "*",
    )

    expect(
      bridge.receiveWindowMessage({
        data: JSON.stringify({
          protocolVersion: 1,
          type: "repopress:bootstrap-port",
          sessionId: "session-1",
        }),
        source: parentWindow,
        ports: [port as unknown as MessagePort],
      }),
    ).toBe(true)
    expect(port.started).toBe(true)
    expect(port.sent).toHaveLength(1)

    let state = createSandboxSessionState({ sessionId: "session-1", snapshotVersion: 3 })
    const ready = validateSandboxMessage(port.sent[0], state)
    state = advanceSandboxSequence(ready)
    expect(ready).toMatchObject({ accepted: true, message: { type: "ready", sequence: 1 } })

    bridge.dispose()
    expect(port.closed).toBe(true)
    expect(port.sent).toHaveLength(2)
    const teardown = validateSandboxMessage(port.sent[1], state)
    state = advanceSandboxSequence(teardown)
    expect(teardown).toMatchObject({ accepted: true, message: { type: "teardown", sequence: 2 } })
    expect(state.invalidated).toBe(true)
  })

  it("emits bounded static-inert-v1 status and fidelity diagnostics over the authenticated port", () => {
    const sandboxWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const parentWindow = { postMessage: vi.fn() }
    const port = new FakePort()
    const bridge = createSandboxRuntimeBridge({ sandboxWindow, parentWindow })
    const offer = {
      protocolVersion: 1,
      type: "repopress:bootstrap-offer",
      sessionId: "session-1",
      snapshotVersion: 3,
      capability: "A".repeat(43),
    }
    bridge.start()
    bridge.receiveWindowMessage({ data: JSON.stringify(offer), source: parentWindow, ports: [] })
    bridge.receiveWindowMessage({
      data: JSON.stringify({ protocolVersion: 1, type: "repopress:bootstrap-port", sessionId: "session-1" }),
      source: parentWindow,
      ports: [port as unknown as MessagePort],
    })
    bridge.reportStatus("loading", "static-inert-v1")
    bridge.reportDiagnostics([
      {
        stage: "render",
        severity: "warning",
        code: "STATIC_INERT_LINK",
        message: "Links are unavailable in static-inert-v1.",
        recoverable: true,
        fidelityImpact: "compatible",
      },
    ])

    let state = createSandboxSessionState({ sessionId: "session-1", snapshotVersion: 3 })
    const messages = port.sent.map((wire) => {
      const result = validateSandboxMessage(wire, state)
      state = advanceSandboxSequence(result)
      return result.accepted ? result.message : null
    })
    expect(messages).toEqual([
      expect.objectContaining({ type: "ready" }),
      expect.objectContaining({ type: "status", payload: { status: "loading", rendererProfile: "static-inert-v1" } }),
      expect.objectContaining({
        type: "diagnostics",
        payload: { diagnostics: [expect.objectContaining({ code: "STATIC_INERT_LINK" })] },
      }),
    ])
  })

  it("assembles only ordered, digest-bound source from the authenticated port", async () => {
    const sandboxWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const parentWindow = { postMessage: vi.fn() }
    const port = new FakePort()
    const onResolution = vi.fn()
    const bridge = createSandboxRuntimeBridge({ sandboxWindow, parentWindow, onResolution })
    const offer = {
      protocolVersion: 1,
      type: "repopress:bootstrap-offer",
      sessionId: "session-1",
      snapshotVersion: 3,
      capability: "A".repeat(43),
    }

    bridge.start()
    bridge.receiveWindowMessage({ data: JSON.stringify(offer), source: parentWindow, ports: [] })
    bridge.receiveWindowMessage({
      data: JSON.stringify({ protocolVersion: 1, type: "repopress:bootstrap-port", sessionId: "session-1" }),
      source: parentWindow,
      ports: [port as unknown as MessagePort],
    })
    const wires = await serializeCompatibleArtifactTransfer({
      resolution: serverResolution,
      expectedAuthority: authorityContext,
    })
    wires.forEach((wire) => {
      port.emit(wire)
    })

    await waitFor(() => expect(onResolution).toHaveBeenCalledWith(serverResolution))
  })

  it("invalidates partial assembly on sequence gaps and closes command floods", async () => {
    const sandboxWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const parentWindow = { postMessage: vi.fn() }
    const port = new FakePort()
    const onResolution = vi.fn()
    const bridge = createSandboxRuntimeBridge({ sandboxWindow, parentWindow, onResolution })
    const offer = {
      protocolVersion: 1,
      type: "repopress:bootstrap-offer",
      sessionId: "session-1",
      snapshotVersion: 3,
      capability: "A".repeat(43),
    }
    bridge.start()
    bridge.receiveWindowMessage({ data: JSON.stringify(offer), source: parentWindow, ports: [] })
    bridge.receiveWindowMessage({
      data: JSON.stringify({ protocolVersion: 1, type: "repopress:bootstrap-port", sessionId: "session-1" }),
      source: parentWindow,
      ports: [port as unknown as MessagePort],
    })
    const wires = await serializeCompatibleArtifactTransfer({
      resolution: serverResolution,
      expectedAuthority: authorityContext,
    })
    port.emit(wires[0])
    port.emit(wires.at(-1))
    await Promise.resolve()
    expect(onResolution).not.toHaveBeenCalled()

    for (let attempt = 0; attempt <= COMPATIBLE_COMMAND_RATE_BURST; attempt += 1) port.emit("{")
    expect(port.closed).toBe(true)
  })

  it("never treats event.origin as bootstrap authentication", () => {
    const sandboxWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const parentWindow = { postMessage: vi.fn() }
    const bridge = createSandboxRuntimeBridge({ sandboxWindow, parentWindow })
    const wire = JSON.stringify({
      protocolVersion: 1,
      type: "repopress:bootstrap-offer",
      sessionId: "session-1",
      snapshotVersion: 1,
      capability: "A".repeat(43),
    })

    expect(bridge.receiveWindowMessage({ data: wire, source: parentWindow, origin: "null", ports: [] })).toBe(false)
    bridge.start()

    expect(
      bridge.receiveWindowMessage({
        data: wire,
        source: { postMessage: vi.fn() },
        origin: "https://preview.repopress.test",
        ports: [],
      }),
    ).toBe(false)
    expect(bridge.receiveWindowMessage({ data: wire, source: parentWindow, origin: "null", ports: [] })).toBe(true)
  })
})
