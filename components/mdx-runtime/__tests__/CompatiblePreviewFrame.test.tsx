import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Preview } from "@/components/studio/preview"
import { serializeSandboxMessage } from "@/lib/preview/sandbox-protocol"
import { createPreviewSandboxHeaders, nextConfig } from "../../../next.config.mjs"
import {
  CompatiblePreviewFrame,
  createCompatiblePreviewHost,
  resolveCompatiblePreviewOrigin,
} from "../CompatiblePreviewFrame"

vi.mock("@sentry/nextjs", () => ({ withSentryConfig: (config: unknown) => config }))

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

  emit(message: string) {
    this.onmessage?.({ data: message } as MessageEvent)
  }
}

class FakeMessageChannel {
  port1 = new FakePort()
  port2 = new FakePort()
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe("CompatiblePreviewFrame", () => {
  it("uses only the script sandbox capability and keeps the bootstrap capability out of its URL", () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")

    render(<CompatiblePreviewFrame sessionId="session-1" snapshotVersion={1} />)

    const frame = screen.getByTitle("Compatible component preview")
    expect(frame).toHaveAttribute("sandbox", "allow-scripts")
    expect(frame.getAttribute("sandbox")?.split(/\s+/)).toEqual(["allow-scripts"])
    expect(frame).not.toHaveAttribute("allow")
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer")
    expect(frame).toHaveAttribute("src", "https://preview.repopress.test/preview/sandbox")
    expect(frame.getAttribute("src")).not.toMatch(/capability|token|session/i)
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
      sessionId: "session-1",
      snapshotVersion: 1,
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
      sessionId: "session-1",
      snapshotVersion: 1,
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
      sessionId: "session-1",
      snapshotVersion: 1,
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

  it("keeps the safe generic Studio preview as the default and makes the shell explicit", () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_ORIGIN", "https://preview.repopress.test")
    const { rerender } = render(<Preview content="# Safe" frontmatter={{ title: "Safe" }} />)

    expect(screen.queryByTitle("Compatible component preview")).not.toBeInTheDocument()
    expect(screen.getAllByRole("heading", { name: "Safe" })).toHaveLength(2)

    rerender(<Preview content="# Safe" frontmatter={{ title: "Safe" }} previewFidelity="compatible" />)
    expect(screen.getByTitle("Compatible component preview")).toBeInTheDocument()
  })
})

describe("preview sandbox response headers", () => {
  it("uses no-store and origin-bound isolation policies without wildcard CORS", async () => {
    const headers = createPreviewSandboxHeaders("https://studio.repopress.test")
    const value = (key: string) => headers.find((header: { key: string; value: string }) => header.key === key)?.value

    expect(value("Cache-Control")).toBe("no-store")
    expect(value("Content-Security-Policy")).toContain("default-src 'none'")
    expect(value("Content-Security-Policy")).toContain("connect-src 'none'")
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
    expect(routes).toContainEqual(expect.objectContaining({ source: "/(.*)" }))
    expect(routes).toContainEqual(
      expect.objectContaining({
        source: "/((?!preview/sandbox$).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      }),
    )
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
