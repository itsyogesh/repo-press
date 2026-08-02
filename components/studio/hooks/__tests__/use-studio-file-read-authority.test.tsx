import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

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
    cleanup()
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

  it("opens Merry metadata exports as editable body content with nested properties", async () => {
    const source = `export const metadata = {
  title: "Free Printable Santa Letter Templates",
  description: "Ready-to-print templates",
  keywords: ["Santa", "letters"],
  alternates: { canonical: "https://merrymagicmail.com/blog/templates" },
}

# Free Santa Letter Templates
`
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        path: "content/guide.mdx",
        name: "guide.mdx",
        sha: "f".repeat(40),
        content: source,
      }),
    } as never)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/guide.mdx"))

    await waitFor(() => expect(result.current.content).toBe("# Free Santa Letter Templates\n"))
    expect(result.current.frontmatter).toEqual({
      title: "Free Printable Santa Letter Templates",
      description: "Ready-to-print templates",
      keywords: ["Santa", "letters"],
      alternates: { canonical: "https://merrymagicmail.com/blog/templates" },
    })
  })

  it("continues to open YAML frontmatter as body content and properties", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        path: "content/guide.mdx",
        name: "guide.mdx",
        sha: "f".repeat(40),
        content: "---\ntitle: Guide\ntags:\n  - docs\n---\n\n# Body\n",
      }),
    } as never)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/guide.mdx"))

    await waitFor(() => expect(result.current.content).toBe("\n# Body\n"))
    expect(result.current.frontmatter).toEqual({ title: "Guide", tags: ["docs"] })
  })

  it("preserves unsupported metadata exports byte-for-byte without fabricating properties", async () => {
    const source = "export const metadata = { title: makeTitle() }\n\n# Body\n"
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        path: "content/guide.mdx",
        name: "guide.mdx",
        sha: "f".repeat(40),
        content: source,
      }),
    } as never)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/guide.mdx"))

    await waitFor(() => expect(result.current.content).toBe(source))
    expect(result.current.frontmatter).toEqual({})
  })

  it("retains parsed metadata values through cache priming and a remote reload", async () => {
    const firstSource = 'export const metadata = { title: "First", alternates: { canonical: "/first" } }\n\n# First\n'
    const reloadedSource =
      'export const metadata = { title: "Reloaded", alternates: { canonical: "/reloaded" } }\n\n# Reloaded\n'
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          path: "content/guide.mdx",
          name: "guide.mdx",
          sha: "f".repeat(40),
          content: firstSource,
        }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          path: "content/guide.mdx",
          name: "guide.mdx",
          sha: "f".repeat(40),
          content: reloadedSource,
        }),
      } as never)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/guide.mdx"))
    await waitFor(() =>
      expect(result.current.frontmatter).toEqual({ title: "First", alternates: { canonical: "/first" } }),
    )

    act(() => {
      result.current.primeFileSnapshot("content/guide.mdx", {
        content: "# Saved draft\n",
        frontmatter: { title: "Saved", alternates: { canonical: "/saved" } },
        sha: "f".repeat(40),
      })
      result.current.navigateToFile("content/guide.mdx")
    })
    await waitFor(() =>
      expect(result.current.frontmatter).toEqual({ title: "Saved", alternates: { canonical: "/saved" } }),
    )

    act(() => result.current.reloadFileFromRemote("content/guide.mdx"))
    await waitFor(() =>
      expect(result.current.frontmatter).toEqual({ title: "Reloaded", alternates: { canonical: "/reloaded" } }),
    )
    expect(result.current.content).toBe("# Reloaded\n")
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

  it("preserves a late Convex draft and its dirty editor state when the cold read returns 404", async () => {
    studioContext.tree = []
    const response = deferred<Response>()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(fetch).mockReturnValueOnce(response.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/draft.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    act(() => {
      result.current.hydrateFromDocument({
        body: "# Saved Convex draft",
        frontmatter: { title: "Draft title" },
      })
    })
    await waitFor(() => expect(result.current.frontmatter).toEqual({ title: "Draft title" }))
    act(() => result.current.setContent("# Unsaved local edit"))
    expect(result.current.isDirty).toBe(true)

    await act(async () => response.resolve({ ok: false, status: 404 } as Response))
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))

    expect(result.current.content).toBe("# Unsaved local edit")
    expect(result.current.frontmatter).toEqual({ title: "Draft title" })
    expect(result.current.sha).toBeNull()
    expect(result.current.isDirty).toBe(true)
    expect(consoleError).toHaveBeenCalledWith("Failed to open file", expect.any(Error))
    consoleError.mockRestore()
  })

  it("preserves a late Convex draft and its dirty editor state when the cold read returns 200", async () => {
    studioContext.tree = []
    const response = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(response.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/draft.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    act(() => {
      result.current.hydrateFromDocument({
        body: "# Saved Convex draft",
        frontmatter: { title: "Draft title" },
      })
    })
    await waitFor(() => expect(result.current.frontmatter).toEqual({ title: "Draft title" }))
    act(() => result.current.setFrontmatterKey("description", "Unsaved description"))

    await act(async () =>
      response.resolve({
        ok: true,
        json: async () => ({
          path: "content/draft.mdx",
          name: "draft.mdx",
          sha: "d".repeat(40),
          content: "# Stale remote body",
        }),
      } as Response),
    )
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))

    expect(result.current.content).toBe("# Saved Convex draft")
    expect(result.current.frontmatter).toEqual({
      title: "Draft title",
      description: "Unsaved description",
    })
    expect(result.current.sha).toBeNull()
    expect(result.current.isDirty).toBe(true)
  })

  it("does not let a title-only Convex row replace an in-flight GitHub snapshot", async () => {
    studioContext.tree = []
    const response = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(response.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/article.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())

    act(() => {
      result.current.hydrateFromDocument({})
    })

    await act(async () =>
      response.resolve({
        ok: true,
        json: async () => ({
          path: "content/article.mdx",
          name: "article.mdx",
          sha: "d".repeat(40),
          content: "# Remote article\n\n<Component />",
        }),
      } as Response),
    )

    await waitFor(() => expect(result.current.content).toContain("# Remote article"))
    expect(result.current.content).toContain("<Component />")
    expect(result.current.sha).toBe("d".repeat(40))
    expect(result.current.isDirty).toBe(false)
  })

  it("exposes title-only versus real empty-draft hydration during an in-flight read", async () => {
    studioContext.tree = []
    const response = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(response.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/new.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())

    let titleOnlyHydrated: unknown
    act(() => {
      titleOnlyHydrated = result.current.hydrateFromDocument({})
    })
    expect(titleOnlyHydrated).toBe(false)

    let emptyDraftHydrated: unknown
    act(() => {
      emptyDraftHydrated = result.current.hydrateFromDocument({ body: "", frontmatter: {} })
    })
    expect(emptyDraftHydrated).toBe(true)

    await act(async () =>
      response.resolve({
        ok: true,
        json: async () => ({
          path: "content/new.mdx",
          name: "new.mdx",
          sha: "e".repeat(40),
          content: "# Remote file at colliding path",
        }),
      } as Response),
    )

    await waitFor(() => expect(result.current.isFileLoading).toBe(false))
    expect(result.current.content).toBe("")
    expect(result.current.frontmatter).toEqual({})
    expect(result.current.sha).toBeNull()
  })

  it("preserves unsaved edits when a Convex draft arrives after the GitHub snapshot", async () => {
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/guide.mdx"))
    await waitFor(() => expect(result.current.content).toBe("# Base snapshot"))

    act(() => result.current.setContent("# Unsaved local edit"))
    act(() => result.current.setFrontmatterKey("description", "Unsaved description"))
    expect(result.current.isDirty).toBe(true)

    let draftHandled: unknown
    act(() => {
      draftHandled = result.current.hydrateFromDocument({
        body: "# Older saved draft",
        frontmatter: { description: "Older description" },
      })
    })

    expect(draftHandled).toBe(true)
    expect(result.current.content).toBe("# Unsaved local edit")
    expect(result.current.frontmatter).toEqual({ description: "Unsaved description" })
    expect(result.current.isDirty).toBe(true)
  })

  it("resolves pathname popstate links relative to contentRoot while leaving query paths repository-relative", async () => {
    studioContext.tree = []
    const { result } = renderHook(() => useStudioFile(null, ""))

    window.history.replaceState({}, "", "/dashboard/acme/docs/studio/guides/getting-started.mdx?branch=release")
    act(() => window.dispatchEvent(new PopStateEvent("popstate")))

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("path=content%2Fguides%2Fgetting-started.mdx")
    await waitFor(() => expect(result.current.selectedFile?.path).toBe("content/guides/getting-started.mdx"))
  })

  it("preserves a late primed snapshot when the cold read returns 404", async () => {
    studioContext.tree = []
    const response = deferred<Response>()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(fetch).mockReturnValueOnce(response.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/primed.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    act(() => {
      result.current.primeFileSnapshot("content/primed.mdx", {
        content: "# Primed local body",
        frontmatter: { title: "Primed title" },
        sha: null,
      })
    })
    await act(async () => response.resolve({ ok: false, status: 404 } as Response))
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))

    expect(result.current.content).toBe("# Primed local body")
    expect(result.current.frontmatter).toEqual({ title: "Primed title" })
    expect(result.current.sha).toBeNull()
    expect(result.current.isDirty).toBe(false)
    expect(consoleError).toHaveBeenCalledWith("Failed to open file", expect.any(Error))
    consoleError.mockRestore()
  })

  it("keeps a late primed snapshot out of a stale remote success and does not cache the remote body", async () => {
    studioContext.tree = []
    const response = deferred<Response>()
    vi.mocked(fetch)
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce({ ok: false, status: 404 } as never)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/primed.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    act(() => {
      result.current.primeFileSnapshot("content/primed.mdx", {
        content: "# Primed local body",
        frontmatter: { title: "Primed title" },
        sha: null,
      })
    })
    await act(async () =>
      response.resolve({
        ok: true,
        json: async () => ({
          path: "content/primed.mdx",
          name: "primed.mdx",
          sha: "c".repeat(40),
          content: "# Stale remote body",
        }),
      } as Response),
    )

    await waitFor(() => expect(result.current.content).toBe("# Primed local body"))
    expect(result.current.frontmatter).toEqual({ title: "Primed title" })
    expect(result.current.sha).toBeNull()
    expect(result.current.isDirty).toBe(false)

    act(() => result.current.navigateToFile("content/primed.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.content).toBe("# Primed local body"))
    expect(result.current.content).not.toContain("Stale remote")
    consoleError.mockRestore()
  })

  it("keeps a newer file request loading until that request settles", async () => {
    const guideResponse = deferred<Response>()
    const otherResponse = deferred<Response>()
    studioContext.tree = [
      { name: "guide.mdx", path: "content/guide.mdx", sha: "f".repeat(40), type: "file" },
      { name: "other.mdx", path: "content/other.mdx", sha: "e".repeat(40), type: "file" },
    ]
    vi.mocked(fetch).mockImplementation((input) =>
      String(input).includes("guide.mdx") ? guideResponse.promise : otherResponse.promise,
    )
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/guide.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    act(() => result.current.navigateToFile("content/other.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    await act(async () =>
      guideResponse.resolve({
        ok: true,
        json: async () => ({
          path: "content/guide.mdx",
          name: "guide.mdx",
          sha: "f".repeat(40),
          content: "# Stale guide",
        }),
      } as Response),
    )
    expect(result.current.selectedFile?.path).toBe("content/other.mdx")
    expect(result.current.content).toBe("")
    expect(result.current.isFileLoading).toBe(true)

    await act(async () =>
      otherResponse.resolve({
        ok: true,
        json: async () => ({
          path: "content/other.mdx",
          name: "other.mdx",
          sha: "e".repeat(40),
          content: "# Current other",
        }),
      } as Response),
    )
    await waitFor(() => expect(result.current.content).toBe("# Current other"))
    expect(result.current.isFileLoading).toBe(false)
  })
})
