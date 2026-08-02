import { renderHook, waitFor } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const BASE_SHA = "a".repeat(40)

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
})
