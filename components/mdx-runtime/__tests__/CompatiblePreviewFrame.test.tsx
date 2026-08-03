import { createRequire } from "node:module"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { Preview } from "@/components/studio/preview"
import { createSignedCompatibleFixture } from "@/lib/preview/__tests__/compatible-test-fixture"
import {
  type CompatiblePreviewAuthorityContext,
  type VerifiedCompatiblePreviewResolution,
  verifySignedCompatiblePreviewResolution,
} from "@/lib/preview/compatible-artifact"
import type { PreviewResult } from "@/lib/preview/contracts"
import { buildGenericRenderModel } from "@/lib/preview/generic-render-model"
import { SANDBOX_MAX_MESSAGE_BYTES, SANDBOX_RATE_BURST, serializeSandboxMessage } from "@/lib/preview/sandbox-protocol"
import { createPreviewSandboxHeaders, nextConfig } from "../../../next.config.mjs"
import {
  CompatiblePreviewFrame,
  createCompatiblePreviewHost,
  resolveCompatiblePreviewOrigin,
} from "../CompatiblePreviewFrame"

vi.mock("@sentry/nextjs", () => ({ withSentryConfig: (config: unknown) => config }))

const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as {
  pathToRegexp(source: string): RegExp
}

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

class FakeMessageChannel {
  port1 = new FakePort()
  port2 = new FakePort()
}

const authorityContext: CompatiblePreviewAuthorityContext = {
  tenantId: "tenant-1",
  projectId: "project-1",
  baseCommit: "abc123",
  documentPath: "content/example.mdx",
  sessionId: "session-1",
  snapshotVersion: 1,
}

function genericPreviewResult(source = "# Safe"): PreviewResult {
  return {
    fidelity: "generic",
    sessionId: "generic-session",
    snapshotVersion: 1,
    status: "ready",
    target: { kind: "safe-fallback", renderModel: buildGenericRenderModel(source) },
    diagnostics: [],
    downgradeReasons: [],
    cache: { hit: false },
  }
}

function compatiblePreviewResult(authority: CompatiblePreviewAuthorityContext = authorityContext): PreviewResult {
  return {
    fidelity: "compatible",
    sessionId: authority.sessionId,
    snapshotVersion: authority.snapshotVersion,
    status: "ready",
    target: { kind: "sandboxed-iframe", url: "https://preview.repopress.test/preview/sandbox" },
    diagnostics: [],
    downgradeReasons: [],
    cache: { hit: false },
  }
}
let serverResolution: VerifiedCompatiblePreviewResolution
let serverWire: string
let reissuedServerWire: string
let changedServerWire: string
let secondSessionResolution: VerifiedCompatiblePreviewResolution
let secondSessionAuthority: CompatiblePreviewAuthorityContext
let secondSnapshotResolution: VerifiedCompatiblePreviewResolution
let secondSnapshotAuthority: CompatiblePreviewAuthorityContext
let forgedWire: string
let approvalPublicKey: JsonWebKey

beforeAll(async () => {
  const fixture = await createSignedCompatibleFixture()
  serverWire = fixture.wire
  approvalPublicKey = fixture.publicKey
  const verified = await verifySignedCompatiblePreviewResolution(fixture.wire, {
    publicKey: fixture.publicKey,
    expectedAuthority: fixture.expectedAuthority,
  })
  if (!verified) throw new Error("Expected signed fixture to verify")
  serverResolution = verified
  const reissued = await createSignedCompatibleFixture({
    keyPair: fixture.keyPair,
    keyId: "same-trust-key-new-label",
    approvalId: "approval-2",
    issuedAt: fixture.resolution.authority.issuedAt + 1,
    expiresAt: fixture.resolution.authority.expiresAt + 1,
  })
  expect(reissued.resolution.authority.executableDigest).toBe(fixture.resolution.authority.executableDigest)
  expect(reissued.resolution.authority.signature).not.toBe(fixture.resolution.authority.signature)
  reissuedServerWire = reissued.wire
  changedServerWire = (await createSignedCompatibleFixture({ documentSource: "# Changed", keyPair: fixture.keyPair }))
    .wire
  const secondSession = await createSignedCompatibleFixture({ sessionId: "session-2", keyPair: fixture.keyPair })
  secondSessionAuthority = secondSession.expectedAuthority
  const verifiedSecondSession = await verifySignedCompatiblePreviewResolution(secondSession.wire, {
    publicKey: fixture.publicKey,
    expectedAuthority: secondSession.expectedAuthority,
  })
  if (!verifiedSecondSession) throw new Error("Expected second session fixture to verify")
  secondSessionResolution = verifiedSecondSession
  const secondSnapshot = await createSignedCompatibleFixture({
    sessionId: "session-2",
    snapshotVersion: 2,
    keyPair: fixture.keyPair,
  })
  secondSnapshotAuthority = secondSnapshot.expectedAuthority
  const verifiedSecondSnapshot = await verifySignedCompatiblePreviewResolution(secondSnapshot.wire, {
    publicKey: fixture.publicKey,
    expectedAuthority: secondSnapshot.expectedAuthority,
  })
  if (!verifiedSecondSnapshot) throw new Error("Expected second snapshot fixture to verify")
  secondSnapshotResolution = verifiedSecondSnapshot
  forgedWire = (await createSignedCompatibleFixture()).wire
})

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK", JSON.stringify(approvalPublicKey))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function connectHost(onMessage = vi.fn()) {
  const hostWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const expectedWindow = { postMessage: vi.fn() }
  const channel = new FakeMessageChannel()
  const host = createCompatiblePreviewHost({
    hostWindow,
    iframeWindow: expectedWindow,
    authorityContext,
    createMessageChannel: () => channel as unknown as MessageChannel,
    onMessage,
  })
  host.start()
  const offer = JSON.parse(expectedWindow.postMessage.mock.calls[0][0])
  host.receiveWindowMessage({
    source: expectedWindow,
    data: JSON.stringify({ ...offer, type: "repopress:bootstrap-accept" }),
  })
  return { channel, host, onMessage }
}

function runtimeWire(sessionId: string, snapshotVersion: number, sequence: number, type = "rendered") {
  return serializeSandboxMessage({
    protocolVersion: 1,
    type,
    sessionId,
    snapshotVersion,
    sequence,
    payload: {},
  })
}

describe("CompatiblePreviewFrame", () => {
  it("uses only the script sandbox capability and keeps the bootstrap capability out of its URL", () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")

    render(<CompatiblePreviewFrame resolution={serverResolution} authorityContext={authorityContext} />)

    const frame = screen.getByTitle("Compatible component preview")
    expect(frame).toHaveAttribute("sandbox", "allow-scripts")
    expect(frame.getAttribute("sandbox")?.split(/\s+/)).toEqual(["allow-scripts"])
    expect(frame).not.toHaveAttribute("allow")
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer")
    expect(frame).toHaveAttribute("src", "https://preview.repopress.test/preview/sandbox")
    expect(frame.getAttribute("src")).not.toMatch(/capability|token|session/i)
    expect(frame).toHaveClass("h-full", "w-full", "min-h-0", "border-0", "rounded-none")
    expect(frame).not.toHaveClass("min-h-80", "rounded-lg", "border-border")
  })

  it("retries the same bootstrap offer when the sandbox listener starts after iframe load", () => {
    vi.useFakeTimers()
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")
    const channels: FakeMessageChannel[] = []
    vi.stubGlobal(
      "MessageChannel",
      class extends FakeMessageChannel {
        constructor() {
          super()
          channels.push(this)
        }
      },
    )
    render(<CompatiblePreviewFrame resolution={serverResolution} authorityContext={authorityContext} />)
    const frame = screen.getByTitle("Compatible component preview") as HTMLIFrameElement
    const frameWindow = frame.contentWindow as Window
    const postMessage = vi.spyOn(frameWindow, "postMessage")

    fireEvent.load(frame)
    expect(postMessage).toHaveBeenCalledOnce()
    const firstOffer = JSON.parse(postMessage.mock.calls[0][0] as string)

    act(() => vi.advanceTimersByTime(300))
    expect(postMessage).toHaveBeenCalledTimes(2)
    expect(JSON.parse(postMessage.mock.calls[1][0] as string)).toEqual(firstOffer)

    window.dispatchEvent(
      new MessageEvent("message", {
        source: frameWindow,
        data: JSON.stringify({ ...firstOffer, type: "repopress:bootstrap-accept" }),
      }),
    )
    expect(channels).toHaveLength(1)
    expect(postMessage).toHaveBeenCalledTimes(3)

    act(() => vi.advanceTimersByTime(3_000))
    expect(postMessage).toHaveBeenCalledTimes(3)
  })

  it("fails closed in production for missing, invalid, insecure, or same-origin configuration", () => {
    const studioOrigin = "https://studio.repopress.test"
    const configuredStudioOrigin = `${studioOrigin}/`

    expect(
      resolveCompatiblePreviewOrigin({
        configuredOrigin: undefined,
        configuredStudioOrigin,
        studioOrigin,
        environment: "production",
      }),
    ).toEqual({ ok: false, code: "PREVIEW_ORIGIN_MISSING" })
    expect(
      resolveCompatiblePreviewOrigin({
        configuredOrigin: "not a URL",
        configuredStudioOrigin,
        studioOrigin,
        environment: "production",
      }),
    ).toEqual({ ok: false, code: "PREVIEW_ORIGIN_INVALID" })
    expect(
      resolveCompatiblePreviewOrigin({
        configuredOrigin: "http://preview.repopress.test",
        configuredStudioOrigin,
        studioOrigin,
        environment: "production",
      }),
    ).toEqual({ ok: false, code: "PREVIEW_ORIGIN_INSECURE" })
    expect(
      resolveCompatiblePreviewOrigin({
        configuredOrigin: `${studioOrigin}/`,
        configuredStudioOrigin,
        studioOrigin,
        environment: "production",
      }),
    ).toEqual({ ok: false, code: "PREVIEW_ORIGIN_NOT_ISOLATED" })
  })

  it("requires the configured production Studio origin to be HTTPS and equal to the live origin", () => {
    const base = {
      configuredOrigin: "https://preview.repopress.test",
      studioOrigin: "https://studio.repopress.test",
      environment: "production" as const,
    }

    expect(resolveCompatiblePreviewOrigin({ ...base, configuredStudioOrigin: undefined })).toEqual({
      ok: false,
      code: "STUDIO_ORIGIN_MISSING",
    })
    expect(
      resolveCompatiblePreviewOrigin({ ...base, configuredStudioOrigin: "https://studio.repopress.test/app" }),
    ).toEqual({ ok: false, code: "STUDIO_ORIGIN_INVALID" })
    expect(resolveCompatiblePreviewOrigin({ ...base, configuredStudioOrigin: "http://studio.repopress.test" })).toEqual(
      { ok: false, code: "STUDIO_ORIGIN_INSECURE" },
    )
    expect(
      resolveCompatiblePreviewOrigin({ ...base, configuredStudioOrigin: "https://www.studio.repopress.test" }),
    ).toEqual({ ok: false, code: "STUDIO_ORIGIN_MISMATCH" })
    expect(
      resolveCompatiblePreviewOrigin({ ...base, configuredStudioOrigin: "https://studio.repopress.test/" }),
    ).toEqual({
      ok: true,
      origin: "https://preview.repopress.test",
    })
  })

  it("authenticates the exact WindowProxy before transferring one MessagePort", () => {
    const listeners = new Set<(event: MessageEvent) => void>()
    const hostWindow = {
      addEventListener: (_type: "message", listener: (event: MessageEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: "message", listener: (event: MessageEvent) => void) => listeners.delete(listener),
    }
    const postMessage = vi.fn()
    const expectedWindow = { postMessage }
    const attackerWindow = { postMessage: vi.fn() }
    const channel = new FakeMessageChannel()
    const host = createCompatiblePreviewHost({
      hostWindow,
      iframeWindow: expectedWindow,
      authorityContext,
      createMessageChannel: () => channel as unknown as MessageChannel,
    })

    host.start()
    expect(listeners.size).toBe(1)
    const offer = JSON.parse(postMessage.mock.calls[0][0])
    expect(offer).toMatchObject({
      protocolVersion: 1,
      type: "repopress:bootstrap-offer",
      sessionId: "session-1",
      snapshotVersion: 1,
    })

    const acceptance = JSON.stringify({ ...offer, type: "repopress:bootstrap-accept" })
    expect(host.receiveWindowMessage({ data: acceptance, source: attackerWindow })).toBe(false)
    expect(postMessage).toHaveBeenCalledTimes(1)

    expect(host.receiveWindowMessage({ data: acceptance, source: expectedWindow })).toBe(true)
    expect(postMessage).toHaveBeenCalledTimes(2)
    expect(postMessage.mock.calls[1][0]).toBe(
      JSON.stringify({ protocolVersion: 1, type: "repopress:bootstrap-port", sessionId: "session-1" }),
    )
    expect(postMessage.mock.calls[1][1]).toBe("*")
    expect(postMessage.mock.calls[1][2]).toEqual([channel.port2])
    expect(channel.port1.started).toBe(true)

    // The single-use capability cannot bootstrap another channel.
    expect(host.receiveWindowMessage({ data: acceptance, source: expectedWindow })).toBe(false)
    expect(postMessage).toHaveBeenCalledTimes(2)
  })

  it("sends a digest-bound resolved artifact in bounded ordered chunks after authentication", async () => {
    const hostWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const expectedWindow = { postMessage: vi.fn() }
    const channel = new FakeMessageChannel()
    const host = createCompatiblePreviewHost({
      hostWindow,
      iframeWindow: expectedWindow,
      authorityContext,
      resolution: serverResolution,
      createMessageChannel: () => channel as unknown as MessageChannel,
    } as never)

    host.start()
    expect(channel.port1.sent).toEqual([])
    const offer = JSON.parse(expectedWindow.postMessage.mock.calls[0][0])
    host.receiveWindowMessage({
      source: expectedWindow,
      data: JSON.stringify({ ...offer, type: "repopress:bootstrap-accept" }),
    })

    await waitFor(() => expect(channel.port1.sent.length).toBeGreaterThanOrEqual(3))
    const commands = channel.port1.sent.map((wire) => JSON.parse(wire))
    expect(commands.map((command) => command.type)).toEqual([
      "repopress:artifact-start",
      "repopress:artifact-chunk",
      "repopress:artifact-commit",
    ])
    expect(commands.map((command) => command.sequence)).toEqual([1, 2, 3])
    expect(channel.port1.sent.every((wire) => !wire.includes("# Isolated"))).toBe(true)
  })

  it("atomically applies serialized teardown before closing the port and invalidating the session", () => {
    const hostWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const postMessage = vi.fn()
    const expectedWindow = { postMessage }
    const channel = new FakeMessageChannel()
    const host = createCompatiblePreviewHost({
      hostWindow,
      iframeWindow: expectedWindow,
      authorityContext,
      createMessageChannel: () => channel as unknown as MessageChannel,
    })

    host.start()
    const offer = JSON.parse(postMessage.mock.calls[0][0])
    host.receiveWindowMessage({
      source: expectedWindow,
      data: JSON.stringify({ ...offer, type: "repopress:bootstrap-accept" }),
    })
    channel.port1.emit(
      serializeSandboxMessage({
        protocolVersion: 1,
        type: "teardown",
        sessionId: "session-1",
        snapshotVersion: 1,
        sequence: 1,
        payload: {},
      }),
    )

    expect(channel.port1.closed).toBe(true)
    expect(host.getSessionState()).toMatchObject({ invalidated: true, sequence: 1 })
    expect(host.getSessionState().rateLimit.attemptedMessages).toBe(1)
  })

  it("fails the session closed when an authenticated channel cannot be constructed", () => {
    const hostWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const expectedWindow = { postMessage: vi.fn() }
    const host = createCompatiblePreviewHost({
      hostWindow,
      iframeWindow: expectedWindow,
      authorityContext,
      createMessageChannel: () => {
        throw new Error("channel unavailable")
      },
    })

    host.start()
    const offer = JSON.parse(expectedWindow.postMessage.mock.calls[0][0])
    expect(() =>
      host.receiveWindowMessage({
        source: expectedWindow,
        data: JSON.stringify({ ...offer, type: "repopress:bootstrap-accept" }),
      }),
    ).not.toThrow()
    expect(host.getSessionState().invalidated).toBe(true)
    expect(hostWindow.removeEventListener).toHaveBeenCalledOnce()
  })

  it.each([
    ["INVALID_TRANSPORT", { hostile: true }],
    ["MESSAGE_TOO_LARGE", "x".repeat(SANDBOX_MAX_MESSAGE_BYTES + 1)],
    ["MESSAGE_TOO_COMPLEX", JSON.stringify(Array.from({ length: 65 }, () => null))],
  ])("applies %s before terminating the hostile session", (_code, hostileMessage) => {
    const { channel, host, onMessage } = connectHost()

    channel.port1.emit(hostileMessage)

    expect(host.getSessionState()).toMatchObject({ invalidated: true, sequence: 0 })
    expect(host.getSessionState().rateLimit.attemptedMessages).toBe(1)
    expect(channel.port1.closed).toBe(true)
    expect(onMessage).not.toHaveBeenCalled()

    channel.port1.emit(runtimeWire("session-1", 1, 1))
    expect(onMessage).not.toHaveBeenCalled()
  })

  it("terminates on RATE_LIMIT after applying the terminal refusal", () => {
    const { channel, host, onMessage } = connectHost()
    for (let attempt = 0; attempt < SANDBOX_RATE_BURST; attempt += 1) channel.port1.emit("{")

    expect(channel.port1.closed).toBe(false)
    channel.port1.emit(runtimeWire("session-1", 1, 1))

    expect(host.getSessionState()).toMatchObject({ invalidated: true, sequence: 0 })
    expect(host.getSessionState().rateLimit.attemptedMessages).toBe(SANDBOX_RATE_BURST)
    expect(channel.port1.closed).toBe(true)
    expect(onMessage).not.toHaveBeenCalled()
  })

  it("keeps non-terminal schema, session, and order refusals recoverable", () => {
    const { channel, host, onMessage } = connectHost()

    channel.port1.emit(JSON.stringify({ invalid: true }))
    channel.port1.emit(runtimeWire("foreign-session", 1, 1))
    channel.port1.emit(runtimeWire("session-1", 1, 2))

    expect(host.getSessionState()).toMatchObject({ invalidated: false, sequence: 0 })
    expect(host.getSessionState().rateLimit.attemptedMessages).toBe(3)
    expect(channel.port1.closed).toBe(false)

    channel.port1.emit(runtimeWire("session-1", 1, 1))
    expect(onMessage).toHaveBeenCalledOnce()
  })

  it("updates the live callback without reloading or leaving a stale callback", () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")
    const channels: FakeMessageChannel[] = []
    vi.stubGlobal(
      "MessageChannel",
      class extends FakeMessageChannel {
        constructor() {
          super()
          channels.push(this)
        }
      },
    )
    const firstCallback = vi.fn()
    const nextCallback = vi.fn()
    const { rerender } = render(
      <CompatiblePreviewFrame
        resolution={serverResolution}
        authorityContext={authorityContext}
        onMessage={firstCallback}
      />,
    )
    const frame = screen.getByTitle("Compatible component preview") as HTMLIFrameElement
    const frameWindow = frame.contentWindow as Window
    const postMessage = vi.spyOn(frameWindow, "postMessage")
    fireEvent.load(frame)
    const offer = JSON.parse(postMessage.mock.calls[0][0] as string)
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frameWindow,
        data: JSON.stringify({ ...offer, type: "repopress:bootstrap-accept" }),
      }),
    )
    channels[0].port1.emit(runtimeWire("session-1", 1, 1))
    expect(firstCallback).toHaveBeenCalledOnce()

    rerender(
      <CompatiblePreviewFrame
        resolution={serverResolution}
        authorityContext={authorityContext}
        onMessage={nextCallback}
      />,
    )
    expect(screen.getByTitle("Compatible component preview")).toBe(frame)
    channels[0].port1.emit(runtimeWire("session-1", 1, 2))

    expect(firstCallback).toHaveBeenCalledOnce()
    expect(nextCallback).toHaveBeenCalledOnce()
    expect(channels[0].port1.closed).toBe(false)
  })

  it("kills the mounted frame on every post-bootstrap load without issuing another capability", () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")
    const channels: FakeMessageChannel[] = []
    vi.stubGlobal(
      "MessageChannel",
      class extends FakeMessageChannel {
        constructor() {
          super()
          channels.push(this)
        }
      },
    )
    render(<CompatiblePreviewFrame resolution={serverResolution} authorityContext={authorityContext} />)
    const frame = screen.getByTitle("Compatible component preview") as HTMLIFrameElement
    const frameWindow = frame.contentWindow as Window
    const postMessage = vi.spyOn(frameWindow, "postMessage")

    fireEvent.load(frame)
    const offer = JSON.parse(postMessage.mock.calls[0][0] as string)
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frameWindow,
        data: JSON.stringify({ ...offer, type: "repopress:bootstrap-accept" }),
      }),
    )
    expect(channels).toHaveLength(1)
    expect(channels[0].port1.closed).toBe(false)

    // A repository component can navigate its own sandboxed frame. The same
    // WindowProxy must never receive a fresh capability or artifact afterward.
    fireEvent.load(frame)

    expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument()
    expect(postMessage).toHaveBeenCalledTimes(2)
    expect(channels).toHaveLength(1)
    expect(channels[0].port1.closed).toBe(true)
  })

  it("atomically replaces the iframe and host when session or snapshot authority changes", () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")
    const channels: FakeMessageChannel[] = []
    vi.stubGlobal(
      "MessageChannel",
      class extends FakeMessageChannel {
        constructor() {
          super()
          channels.push(this)
        }
      },
    )
    const onMessage = vi.fn()
    const { rerender } = render(
      <StrictMode>
        <CompatiblePreviewFrame
          resolution={serverResolution}
          authorityContext={authorityContext}
          onMessage={onMessage}
        />
      </StrictMode>,
    )

    const connectFrame = (frame: HTMLIFrameElement) => {
      const frameWindow = frame.contentWindow as Window
      const postMessage = vi.spyOn(frameWindow, "postMessage")
      fireEvent.load(frame)
      const offer = JSON.parse(postMessage.mock.calls[0][0] as string)
      window.dispatchEvent(
        new MessageEvent("message", {
          source: frameWindow,
          data: JSON.stringify({ ...offer, type: "repopress:bootstrap-accept" }),
        }),
      )
      return { channel: channels.at(-1) as FakeMessageChannel, offer }
    }

    const firstFrame = screen.getByTitle("Compatible component preview") as HTMLIFrameElement
    const first = connectFrame(firstFrame)
    first.channel.port1.emit(runtimeWire("session-1", 1, 1))
    expect(onMessage).toHaveBeenCalledOnce()

    rerender(
      <StrictMode>
        <CompatiblePreviewFrame
          resolution={secondSessionResolution}
          authorityContext={secondSessionAuthority}
          onMessage={onMessage}
        />
      </StrictMode>,
    )
    const secondFrame = screen.getByTitle("Compatible component preview") as HTMLIFrameElement
    expect(secondFrame).not.toBe(firstFrame)
    expect(first.channel.port1.closed).toBe(true)
    first.channel.port1.emit(runtimeWire("session-1", 1, 2))
    expect(onMessage).toHaveBeenCalledOnce()

    const second = connectFrame(secondFrame)
    expect(second.offer).toMatchObject({ sessionId: "session-2", snapshotVersion: 1 })
    second.channel.port1.emit(runtimeWire("session-2", 1, 1))
    expect(onMessage).toHaveBeenCalledTimes(2)

    rerender(
      <StrictMode>
        <CompatiblePreviewFrame
          resolution={secondSnapshotResolution}
          authorityContext={secondSnapshotAuthority}
          onMessage={onMessage}
        />
      </StrictMode>,
    )
    const thirdFrame = screen.getByTitle("Compatible component preview") as HTMLIFrameElement
    expect(thirdFrame).not.toBe(secondFrame)
    expect(second.channel.port1.closed).toBe(true)
    const third = connectFrame(thirdFrame)
    expect(third.offer).toMatchObject({ sessionId: "session-2", snapshotVersion: 2 })
  })

  it("keeps the safe generic Studio preview active until a signed compatible resolution verifies", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")
    const fallbackResult = genericPreviewResult()
    const { rerender } = render(<Preview previewResult={fallbackResult} frontmatter={{ title: "Safe" }} />)

    expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument()
    expect(screen.getAllByRole("heading", { name: "Safe" })).toHaveLength(1)

    rerender(
      <Preview
        previewResult={compatiblePreviewResult()}
        fallbackResult={fallbackResult}
        frontmatter={{ title: "Safe" }}
      />,
    )
    expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument()
    expect(screen.getAllByRole("heading", { name: "Safe" })).toHaveLength(1)

    rerender(
      <Preview
        previewResult={compatiblePreviewResult()}
        fallbackResult={fallbackResult}
        frontmatter={{ title: "Safe" }}
        compatibleResolution={forgedWire}
        compatibleAuthority={authorityContext}
      />,
    )
    await waitFor(() => expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument())
    expect(screen.getAllByRole("heading", { name: "Safe" })).toHaveLength(1)

    for (const mismatch of [
      { tenantId: "tenant-2" },
      { projectId: "project-2" },
      { baseCommit: "def456" },
      { documentPath: "content/other.mdx" },
    ]) {
      rerender(
        <Preview
          previewResult={compatiblePreviewResult()}
          fallbackResult={fallbackResult}
          frontmatter={{ title: "Safe" }}
          compatibleResolution={serverWire}
          compatibleAuthority={{ ...authorityContext, ...mismatch }}
        />,
      )
      await waitFor(() => expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument())
    }

    rerender(
      <Preview
        previewResult={compatiblePreviewResult()}
        fallbackResult={fallbackResult}
        frontmatter={{ title: "Safe" }}
        compatibleResolution={serverWire}
        compatibleAuthority={authorityContext}
      />,
    )
    expect(await screen.findByTitle("Compatible component preview")).toBeInTheDocument()
  })

  it("keeps reissued equivalent content suppressed and retries a changed executable digest", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")
    const channels: FakeMessageChannel[] = []
    vi.stubGlobal(
      "MessageChannel",
      class extends FakeMessageChannel {
        constructor() {
          super()
          channels.push(this)
        }
      },
    )
    const props = {
      previewResult: compatiblePreviewResult(),
      fallbackResult: genericPreviewResult("# Generic fallback"),
      frontmatter: { title: "Document" },
      compatibleResolution: serverWire,
      compatibleAuthority: authorityContext,
    }
    const { rerender } = render(<Preview {...props} />)
    const frame = (await screen.findByTitle("Compatible component preview")) as HTMLIFrameElement
    const frameWindow = frame.contentWindow as Window
    const postMessage = vi.spyOn(frameWindow, "postMessage")
    fireEvent.load(frame)
    const offer = JSON.parse(postMessage.mock.calls[0][0] as string)
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frameWindow,
        data: JSON.stringify({ ...offer, type: "repopress:bootstrap-accept" }),
      }),
    )
    channels[0].port1.emit(
      serializeSandboxMessage({
        protocolVersion: 1,
        type: "diagnostics",
        sessionId: "session-1",
        snapshotVersion: 1,
        sequence: 1,
        payload: {
          diagnostics: [
            {
              stage: "render",
              severity: "warning",
              code: "STATIC_INERT_LINK",
              message: "untrusted text is ignored",
              recoverable: true,
              fidelityImpact: "compatible",
            },
          ],
        },
      }),
    )

    expect(await screen.findByRole("heading", { name: "Generic fallback" })).toBeInTheDocument()
    expect(screen.getByText("Links are unavailable in static-inert-v1.")).toBeInTheDocument()
    expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument()
    expect(channels[0].port1.closed).toBe(true)

    rerender(<Preview {...props} compatibleAuthority={{ ...authorityContext }} />)
    await waitFor(() => expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument())
    expect(channels).toHaveLength(1)

    let releaseVerification = () => {}
    const verificationGate = new Promise<void>((resolve) => {
      releaseVerification = resolve
    })
    const originalVerify = crypto.subtle.verify.bind(crypto.subtle)
    const verify = vi.spyOn(crypto.subtle, "verify").mockImplementation(async (algorithm, key, signature, data) => {
      await verificationGate
      return originalVerify(algorithm, key, signature, data)
    })
    rerender(
      <Preview {...props} compatibleResolution={reissuedServerWire} compatibleAuthority={{ ...authorityContext }} />,
    )
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1))
    expect(screen.queryByText("Links are unavailable in static-inert-v1.")).not.toBeInTheDocument()
    await act(async () => releaseVerification())
    expect(await screen.findByText("Links are unavailable in static-inert-v1.")).toBeInTheDocument()
    expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument()
    expect(channels).toHaveLength(1)

    rerender(
      <Preview {...props} compatibleResolution={changedServerWire} compatibleAuthority={{ ...authorityContext }} />,
    )
    expect(await screen.findByTitle("Compatible component preview")).toBeInTheDocument()
  })

  it("keeps Studio generic when the approval verification key is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK", "")
    render(
      <Preview
        previewResult={compatiblePreviewResult()}
        fallbackResult={genericPreviewResult()}
        frontmatter={{ title: "Safe" }}
        compatibleResolution={serverWire}
        compatibleAuthority={authorityContext}
      />,
    )

    await waitFor(() => expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument())
    expect(screen.getAllByRole("heading", { name: "Safe" })).toHaveLength(1)
  })
})

describe("preview sandbox response headers", () => {
  it("uses no-store and origin-bound isolation policies without wildcard CORS", async () => {
    const headers = createPreviewSandboxHeaders("https://studio.repopress.test")
    const value = (key: string) => headers.find((header: { key: string; value: string }) => header.key === key)?.value

    expect(value("Cache-Control")).toBe("no-store")
    expect(value("Content-Security-Policy")).toContain("default-src 'none'")
    expect(value("Content-Security-Policy")).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    expect(value("Content-Security-Policy")).toContain("connect-src 'none'")
    expect(value("Content-Security-Policy")).toContain("worker-src blob:")
    expect(value("Content-Security-Policy")).not.toContain("worker-src 'self'")
    expect(value("Content-Security-Policy")).toContain("script-src-attr 'none'")
    expect(value("Content-Security-Policy")).toContain("form-action 'none'")
    expect(value("Content-Security-Policy")).toContain("frame-ancestors https://studio.repopress.test")
    expect(value("Access-Control-Allow-Origin")).toBe("https://studio.repopress.test")
    expect(value("Access-Control-Allow-Origin")).not.toBe("*")
    expect(value("Referrer-Policy")).toBe("no-referrer")
    expect(value("X-Robots-Tag")).toBe("noindex, nofollow, noarchive")
    expect(value("X-Frame-Options")).toBeUndefined()

    const routes = await nextConfig.headers?.()
    expect(routes).toBeDefined()
    if (!routes) throw new Error("Expected configured response headers")
    const previewRoute = routes.find((route: { source: string }) => route.source === "/preview/sandbox")
    expect(previewRoute?.headers).toEqual(createPreviewSandboxHeaders(process.env.NEXT_PUBLIC_APP_URL))
    for (const route of routes.filter((route: { source: string }) => route.source !== "/preview/sandbox")) {
      expect(JSON.stringify(route.headers)).not.toContain("unsafe-eval")
    }
    expect(routes).toContainEqual(expect.objectContaining({ source: "/(.*)" }))
    expect(routes).toContainEqual(
      expect.objectContaining({
        source: "/((?!preview/sandbox$).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      }),
    )
  })

  it("deterministically disables DNS prefetch for the sandbox while normal routes keep it enabled", async () => {
    const routes = await nextConfig.headers?.()
    if (!routes) throw new Error("Expected configured response headers")
    const valuesFor = (pathname: string, key: string) => {
      const values: string[] = []
      for (const route of routes) {
        if (!pathToRegexp(route.source).test(pathname)) continue
        for (const header of route.headers) if (header.key === key) values.push(header.value)
      }
      return values
    }

    const sandboxDns = valuesFor("/preview/sandbox", "X-DNS-Prefetch-Control")
    expect(sandboxDns).toEqual(["on", "off"])
    expect(sandboxDns.at(-1)).toBe("off")
    expect(valuesFor("/preview/sandbox", "X-Frame-Options")).toEqual([])

    expect(valuesFor("/preview/sandboxx", "X-DNS-Prefetch-Control")).toEqual(["on"])
    expect(valuesFor("/preview/sandboxx", "X-Frame-Options")).toEqual(["DENY"])
  })

  it("uses the same strict Studio-origin policy for production headers and a local development fallback", () => {
    const csp = (headers: Array<{ key: string; value: string }>) =>
      headers.find((header) => header.key === "Content-Security-Policy")?.value
    const cors = (headers: Array<{ key: string; value: string }>) =>
      headers.find((header) => header.key === "Access-Control-Allow-Origin")?.value

    for (const invalid of [
      undefined,
      "not a URL",
      "http://studio.repopress.test",
      "https://studio.repopress.test/app",
    ]) {
      const headers = createPreviewSandboxHeaders(invalid, "production")
      expect(csp(headers)).toContain("frame-ancestors 'none'")
      expect(cors(headers)).toBeUndefined()
    }

    const configured = createPreviewSandboxHeaders("https://studio.repopress.test/", "production")
    expect(csp(configured)).toContain("frame-ancestors https://studio.repopress.test")
    expect(cors(configured)).toBe("https://studio.repopress.test")

    const local = createPreviewSandboxHeaders(undefined, "development")
    expect(csp(local)).toContain("frame-ancestors 'self'")
    expect(cors(local)).toBeUndefined()
  })
})
