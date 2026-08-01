import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const BASE_SHA = "a".repeat(40)
const studioContext = {
  owner: "acme",
  repo: "docs",
  branch: "release",
  baseCommitSha: BASE_SHA,
  projectId: "project-1",
  contentRoot: "content",
  tree: [{ name: "guide.mdx", path: "content/guide.mdx", sha: "f".repeat(40), type: "file" }],
  role: "owner" as const,
}

vi.mock("../../studio-context", () => ({ useStudio: () => studioContext }))

import { useStudioFile } from "../use-studio-file"

describe("useStudioFile immutable read authority", () => {
  beforeEach(() => {
    studioContext.tree = [{ name: "guide.mdx", path: "content/guide.mdx", sha: "f".repeat(40), type: "file" }]
    localStorage.clear()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          path: "content/guide.mdx",
          name: "guide.mdx",
          sha: "f".repeat(40),
          content: "# Base snapshot",
        }),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it("reads later-opened files from the captured base SHA while retaining branch navigation", async () => {
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/guide.mdx"))

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const requestUrl = String(vi.mocked(fetch).mock.calls[0][0])
    expect(requestUrl).toContain(`ref=${BASE_SHA}`)
    expect(requestUrl).not.toContain("branch=release")
    expect(window.location.search).toContain("branch=release")
  })

  it("fetches a cold deep link from the captured base SHA before the tree hydrates", async () => {
    studioContext.tree = []
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        path: "content/cold.mdx",
        name: "cold.mdx",
        sha: "b".repeat(40),
        content: "# Cold snapshot",
      }),
    } as never)

    const { result } = renderHook(() => useStudioFile(null, "content/cold.mdx"))

    await waitFor(() => expect(result.current.content).toBe("# Cold snapshot"))
    const requestUrl = String(vi.mocked(fetch).mock.calls[0][0])
    expect(requestUrl).toContain("path=content%2Fcold.mdx")
    expect(requestUrl).toContain(`ref=${BASE_SHA}`)
    expect(result.current.sha).toBe("b".repeat(40))
  })

  it("tries GitHub for a sha-null cached draft and preserves it when the remote path is absent", async () => {
    studioContext.tree = []
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as never)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => {
      result.current.primeFileSnapshot("content/new.mdx", {
        content: "# Local draft",
        frontmatter: { title: "Local" },
        sha: null,
      })
    })
    act(() => result.current.navigateToFile("content/new.mdx"))

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    await waitFor(() => expect(result.current.content).toBe("# Local draft"))
    expect(result.current.frontmatter).toEqual({ title: "Local" })
    expect(result.current.sha).toBeNull()
    expect(consoleError).toHaveBeenCalledWith("Failed to open file", expect.any(Error))
    consoleError.mockRestore()
  })
})
