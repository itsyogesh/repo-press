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
})
