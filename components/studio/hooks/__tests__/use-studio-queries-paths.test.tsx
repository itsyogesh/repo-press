import { act, renderHook, waitFor } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const BASE_SHA = "a".repeat(40)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

const { studioContextMock, useQueryMock } = vi.hoisted(() => ({
  studioContextMock: {
    projectId: "project_123",
    contentRoot: "content/docs",
    tree: [] as Array<{ name: string; path: string; sha: string; type: "file" }>,
    owner: "acme",
    repo: "docs",
    branch: "main",
    baseCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    projectAccessToken: "project-token",
  },
  useQueryMock: vi.fn(),
}))

vi.mock("convex/react", () => ({ useQuery: useQueryMock }))

vi.mock("../../studio-context", () => ({
  useStudio: () => studioContextMock,
}))

import { useStudioQueries } from "../use-studio-queries"

describe("useStudioQueries path ingress", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studioContextMock.contentRoot = "content/docs"
    studioContextMock.tree = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("pins automatic title synchronization to the Studio base commit", async () => {
    studioContextMock.tree = [{ name: "start.mdx", path: "content/docs/start.mdx", sha: "f".repeat(40), type: "file" }]
    useQueryMock
      .mockReturnValueOnce({ _id: "user_1" })
      .mockReturnValueOnce({ _id: "project_123" })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ ok: true }) }))

    renderHook(() => useStudioQueries())

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const request = vi.mocked(fetch).mock.calls[0]
    expect(request[0]).toBe("/api/github/sync-titles")
    expect(JSON.parse(String(request[1]?.body))).toMatchObject({
      branch: "main",
      readRef: BASE_SHA,
    })
  })

  it("waits for a later subscription before retrying a failed title sync", async () => {
    studioContextMock.tree = [{ name: "retry.mdx", path: "content/docs/retry.mdx", sha: "e".repeat(40), type: "file" }]
    useQueryMock
      .mockReturnValueOnce({ _id: "user_1" })
      .mockReturnValueOnce({ _id: "project_123" })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const failedResponse = deferred<Response>()
    const retryResponse = deferred<Response>()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValueOnce(failedResponse.promise).mockReturnValueOnce(retryResponse.promise),
    )

    const first = renderHook(() => useStudioQueries())
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    await act(async () => failedResponse.resolve({ ok: false, status: 500 } as Response))
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith("Failed to sync tree titles:", expect.any(Error)))
    expect(consoleError.mock.calls[0]?.[1]).toMatchObject({ message: "Title sync failed (500)" })
    await act(async () => Promise.resolve())
    expect(fetch).toHaveBeenCalledOnce()

    first.unmount()

    renderHook(() => useStudioQueries())
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    await act(async () => retryResponse.resolve({ ok: true, status: 200 } as Response))
    expect(vi.mocked(fetch).mock.calls.every(([url]) => url === "/api/github/sync-titles")).toBe(true)
    consoleError.mockRestore()
  })

  it("bounds inactive title-sync entries", async () => {
    const modulePath = "../use-studio-queries"
    const titleSyncModule = (await import(/* @vite-ignore */ modulePath)) as Record<string, unknown>
    expect(typeof titleSyncModule.__resetTitleSyncStoreForTests).toBe("function")
    expect(typeof titleSyncModule.__getTitleSyncStoreStatsForTests).toBe("function")
    if (
      typeof titleSyncModule.__resetTitleSyncStoreForTests !== "function" ||
      typeof titleSyncModule.__getTitleSyncStoreStatsForTests !== "function"
    ) {
      return
    }

    titleSyncModule.__resetTitleSyncStoreForTests()
    useQueryMock.mockReturnValue(undefined)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    for (let index = 0; index < 40; index += 1) {
      studioContextMock.tree = [
        {
          name: `page-${index}.mdx`,
          path: `content/docs/page-${index}.mdx`,
          sha: index.toString(16).padStart(40, "0"),
          type: "file",
        },
      ]
      const view = renderHook(() => useStudioQueries())
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(index + 1))
      view.unmount()
    }

    const stats = titleSyncModule.__getTitleSyncStoreStatsForTests() as { size: number; maxEntries: number }
    expect(stats.size).toBeLessThanOrEqual(stats.maxEntries)
    expect(stats.maxEntries).toBeLessThan(40)
  })

  it("queries canonical state and normalizes legacy rows at the Studio boundary", () => {
    useQueryMock
      .mockReturnValueOnce({ _id: "user_1" })
      .mockReturnValueOnce({ _id: "project_123" })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        _id: "doc_legacy",
        filePath: "content/docs/guides/start.mdx",
        title: "Start",
        status: "draft",
      })
      .mockReturnValueOnce([{ filePath: "content/docs/guides/start.mdx", title: "Start" }])
      .mockReturnValueOnce([
        {
          _id: "op_legacy",
          opType: "create",
          filePath: "content/docs/guides/new.mdx",
          status: "pending",
        },
      ])
      .mockReturnValueOnce([])
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ _id: "doc_dirty", filePath: "content/docs/guides/edit.mdx" }])

    let result: ReturnType<typeof useStudioQueries> | null = null
    function Harness() {
      result = useStudioQueries("content/docs/guides/start.mdx")
      return null
    }

    renderToStaticMarkup(<Harness />)

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ filePath: "guides/start.mdx", pathRepresentation: "content_relative_v1" }),
    )
    expect(useQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ filePath: "content/docs/guides/start.mdx", pathRepresentation: "legacy_repo_v0" }),
    )
    expect(result!.document).toEqual(expect.objectContaining({ filePath: "guides/start.mdx" }))
    expect(result!.pendingOps?.[0]).toEqual(expect.objectContaining({ filePath: "guides/new.mdx" }))
    expect(result!.dirtyDocs?.[0]).toEqual(expect.objectContaining({ filePath: "guides/edit.mdx" }))
    expect(result!.titleMap).toEqual({ "content/docs/guides/start.mdx": "Start" })
  })

  it("looks up untagged legacy documents when the content root is empty", () => {
    studioContextMock.contentRoot = ""
    useQueryMock
      .mockReturnValueOnce({ _id: "user_1" })
      .mockReturnValueOnce({ _id: "project_123" })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ _id: "doc_legacy", filePath: "guides/start.mdx", title: "Start", status: "draft" })
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])

    let result: ReturnType<typeof useStudioQueries> | null = null
    function Harness() {
      result = useStudioQueries("guides/start.mdx")
      return null
    }

    renderToStaticMarkup(<Harness />)

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ filePath: "guides/start.mdx", pathRepresentation: "legacy_repo_v0" }),
    )
    expect(result!.document).toEqual(expect.objectContaining({ _id: "doc_legacy", filePath: "guides/start.mdx" }))
  })

  it("isolates legacy rows left outside a config-synced content root", () => {
    useQueryMock
      .mockReturnValueOnce({ _id: "user_1" })
      .mockReturnValueOnce({ _id: "project_123" })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([
        { filePath: "page", title: "Stale page" },
        { filePath: "content/docs/guides/start.mdx", title: "Start" },
      ])
      .mockReturnValueOnce([
        { _id: "op_stale", opType: "create", filePath: "page", status: "pending" },
        {
          _id: "op_current",
          opType: "create",
          filePath: "content/docs/guides/new.mdx",
          status: "pending",
        },
      ])
      .mockReturnValueOnce([])
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        { _id: "doc_stale", filePath: "page" },
        { _id: "doc_current", filePath: "content/docs/guides/edit.mdx" },
      ])

    let result: ReturnType<typeof useStudioQueries> | null = null
    function Harness() {
      result = useStudioQueries()
      return null
    }

    expect(() => renderToStaticMarkup(<Harness />)).not.toThrow()
    expect(result!.titleMap).toEqual({ "content/docs/guides/start.mdx": "Start" })
    expect(result!.pendingOps).toEqual([expect.objectContaining({ _id: "op_current", filePath: "guides/new.mdx" })])
    expect(result!.dirtyDocs).toEqual([expect.objectContaining({ _id: "doc_current", filePath: "guides/edit.mdx" })])
  })
})
