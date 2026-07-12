import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { studioContextMock, useQueryMock } = vi.hoisted(() => ({
  studioContextMock: {
    projectId: "project_123",
    contentRoot: "content/docs",
    tree: [],
    owner: "acme",
    repo: "docs",
    branch: "main",
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
