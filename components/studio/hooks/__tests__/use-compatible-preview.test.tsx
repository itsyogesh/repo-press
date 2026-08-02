import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PreviewResult } from "@/lib/preview/contracts"
import { buildGenericRenderModel } from "@/lib/preview/generic-render-model"
import { useCompatiblePreview } from "../use-compatible-preview"

const BASE_SHA = "a".repeat(40)

function generic(source: string): PreviewResult {
  return {
    fidelity: "generic",
    sessionId: `generic-${source}`,
    snapshotVersion: 1,
    status: "ready",
    target: { kind: "safe-fallback", renderModel: buildGenericRenderModel(source) },
    diagnostics: [],
    downgradeReasons: ["COMPATIBLE_UNAVAILABLE"],
    cache: { hit: false },
  }
}

const defaults = {
  projectId: "project-1",
  filePath: "content/post.mdx",
  baseCommitSha: BASE_SHA,
  previewEntry: ".repopress/mdx-preview.tsx",
  documentSource: "# One",
  genericPreviewResult: generic("# One"),
  debounceMs: 200,
}

function payloadFor(body: { snapshotVersion: number; documentSource: string }) {
  const authority = {
    tenantId: "tenant-1",
    projectId: "project-1",
    baseCommit: BASE_SHA,
    documentPath: "content/post.mdx",
    sessionId: `session-${body.snapshotVersion}`,
    snapshotVersion: body.snapshotVersion,
  }
  return {
    previewResult: {
      fidelity: "compatible" as const,
      sessionId: authority.sessionId,
      snapshotVersion: body.snapshotVersion,
      status: "ready" as const,
      target: { kind: "sandboxed-iframe" as const, url: "https://preview.repopress.test/preview/sandbox" },
      diagnostics: [],
      downgradeReasons: [],
      cache: { hit: false },
    },
    authority,
    resolution: JSON.stringify({
      authority: {
        kind: "signed-preview-resolution",
        algorithm: "ECDSA-P256-SHA256",
        keyId: "key-1",
        approvalId: "approval-1",
        ...authority,
        rendererProfile: "static-inert-v1",
        issuedAt: 1_750_000_000_000,
        expiresAt: 1_750_000_300_000,
        executableDigest: "b".repeat(64),
        signature: "c".repeat(86),
      },
      artifact: { artifactId: "artifact-1", documentSource: body.documentSource, adapter: null },
    }),
  }
}

function successResponse(body: { snapshotVersion: number; documentSource: string }) {
  return new Response(JSON.stringify(payloadFor(body)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe("useCompatiblePreview", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv(
      "NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK",
      JSON.stringify({ kty: "EC", crv: "P-256", x: "x", y: "y", key_ops: ["verify"] }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it.each([
    ["project", { projectId: undefined }],
    ["MDX file", { filePath: "content/post.md" }],
    ["preview entry", { previewEntry: undefined }],
    ["base commit", { baseCommitSha: "bad-sha" }],
  ])("does not request without a valid %s", async (_label, override) => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    renderHook(() => useCompatiblePreview({ ...defaults, ...override }))
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not request without a configured verification key", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_APPROVAL_PUBLIC_KEY_JWK", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    renderHook(() => useCompatiblePreview(defaults))
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("debounces edits and sends only the bounded authority request fields", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      return successResponse(body)
    })
    vi.stubGlobal("fetch", fetchMock)
    const hook = renderHook((props) => useCompatiblePreview(props), { initialProps: defaults })

    hook.rerender({ ...defaults, documentSource: "# Two", genericPreviewResult: generic("# Two") })
    hook.rerender({ ...defaults, documentSource: "# Three", genericPreviewResult: generic("# Three") })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toEqual({
      projectId: "project-1",
      filePath: "content/post.mdx",
      baseCommitSha: BASE_SHA,
      snapshotVersion: expect.any(Number),
      documentSource: "# Three",
    })
    expect(hook.result.current.previewResult.fidelity).toBe("compatible")
    expect(hook.result.current.compatibleAuthority?.snapshotVersion).toBe(body.snapshotVersion)
  })

  it.each([
    new Response(JSON.stringify({ error: "no" }), { status: 422 }),
    new Response(JSON.stringify({ previewResult: "invalid" }), { status: 200 }),
  ])("retains Generic preview for a failed or invalid response", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
    const hook = renderHook(() => useCompatiblePreview(defaults))
    await act(() => vi.advanceTimersByTimeAsync(200))
    await act(() => Promise.resolve())
    expect(hook.result.current.previewResult).toBe(defaults.genericPreviewResult)
    expect(hook.result.current.compatibleResolution).toBeNull()
    expect(hook.result.current.compatibleAuthority).toBeNull()
  })

  it("ignores an older response after a newer source snapshot wins", async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    const requestBodies: Array<{ snapshotVersion: number; documentSource: string }> = []
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      requestBodies.push(JSON.parse(String(init.body)))
      return requestBodies.length === 1 ? first.promise : second.promise
    })
    vi.stubGlobal("fetch", fetchMock)
    const hook = renderHook((props) => useCompatiblePreview(props), { initialProps: defaults })
    await act(() => vi.advanceTimersByTimeAsync(200))

    hook.rerender({ ...defaults, documentSource: "# New", genericPreviewResult: generic("# New") })
    await act(() => vi.advanceTimersByTimeAsync(200))
    await act(async () => second.resolve(successResponse(requestBodies[1])))
    expect(hook.result.current.compatibleAuthority?.snapshotVersion).toBe(requestBodies[1].snapshotVersion)

    await act(async () => first.resolve(successResponse(requestBodies[0])))
    expect(hook.result.current.compatibleAuthority?.snapshotVersion).toBe(requestBodies[1].snapshotVersion)
    expect(JSON.parse(hook.result.current.compatibleResolution ?? "{}").artifact.documentSource).toBe("# New")
  })

  it("rejects a response signed for a different document path", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      const payload = payloadFor(body)
      payload.authority.documentPath = "content/other.mdx"
      const signed = JSON.parse(payload.resolution)
      signed.authority.documentPath = "content/other.mdx"
      payload.resolution = JSON.stringify(signed)
      return new Response(JSON.stringify(payload), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)
    const hook = renderHook(() => useCompatiblePreview(defaults))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(hook.result.current.previewResult.fidelity).toBe("generic")
  })

  it("aborts on identity changes and unmount, and clears pending timers", async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal)
        return new Promise<Response>(() => undefined)
      }),
    )
    const hook = renderHook((props) => useCompatiblePreview(props), { initialProps: defaults })
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(signals[0].aborted).toBe(false)

    hook.rerender({ ...defaults, baseCommitSha: "d".repeat(40) })
    expect(signals[0].aborted).toBe(true)
    hook.unmount()
    await act(() => vi.runAllTimersAsync())
    expect(fetch).toHaveBeenCalledOnce()
  })
})
