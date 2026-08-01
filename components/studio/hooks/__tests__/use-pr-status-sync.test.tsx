import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { mutationMock } = vi.hoisted(() => ({ mutationMock: vi.fn() }))
vi.mock("convex/react", () => ({ useMutation: () => mutationMock }))

import { usePrStatusSync } from "../use-pr-status-sync"

const props = {
  projectId: "project_1",
  laneId: "lane_1",
  prNumber: 42,
  laneStatus: "active",
  owner: "acme",
  repo: "docs",
  headBranch: "repopress/start",
  baseBranch: "main",
}

describe("usePrStatusSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("surfaces a non-2xx status-sync response instead of silently treating it as a no-op", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 502, json: vi.fn().mockResolvedValue({ error: "bad authority" }) }),
    )
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    renderHook(() => usePrStatusSync(props as any))

    await waitFor(() => expect(warning).toHaveBeenCalledWith(expect.stringContaining("failed"), expect.any(Error)))
    expect(mutationMock).not.toHaveBeenCalled()
  })

  it("rejects mismatched base identity and never invokes a client lifecycle mutation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          state: "closed",
          merged: true,
          mergeCommitSha: "a".repeat(40),
          baseRef: "release",
          baseRepoFullName: "acme/docs",
          headRef: "repopress/start",
          headRepoFullName: "acme/docs",
          verificationPending: false,
        }),
      }),
    )
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    renderHook(() => usePrStatusSync(props as any))

    await waitFor(() => expect(warning).toHaveBeenCalled())
    expect(mutationMock).not.toHaveBeenCalled()
  })

  it("continues synchronizing a verified closed lane while restoration is pending", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        state: "closed",
        merged: false,
        mergeCommitSha: null,
        baseRef: "main",
        baseRepoFullName: "acme/docs",
        headRef: "repopress/start",
        headRepoFullName: "acme/docs",
        verificationPending: false,
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    renderHook(() => usePrStatusSync({ ...props, laneStatus: "closed" } as any))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it("retries a transient 502 with bounded backoff and succeeds", async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: vi.fn().mockResolvedValue({ error: "temporary gateway failure" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          state: "open",
          merged: false,
          baseRef: "main",
          baseRepoFullName: "acme/docs",
          headRef: "repopress/start",
          headRepoFullName: "acme/docs",
          verificationPending: false,
        }),
      })
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const hook = renderHook(() => usePrStatusSync(props as any))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    hook.unmount()
  })

  it("does not retry a terminal 4xx response", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: vi.fn().mockResolvedValue({ error: "pull request identity conflict" }),
    })
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const hook = renderHook(() => usePrStatusSync(props as any))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    hook.unmount()
  })

  it("aborts the active request and cancels retries when unmounted", async () => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      return new Promise(() => undefined)
    })
    vi.stubGlobal("fetch", fetchMock)

    const hook = renderHook(() => usePrStatusSync(props as any))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    hook.unmount()
    expect(requestSignal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
