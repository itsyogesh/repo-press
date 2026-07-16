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
})
