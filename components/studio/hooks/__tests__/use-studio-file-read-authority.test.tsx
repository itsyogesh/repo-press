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

  it("keeps a cold existing-file read non-writable until immutable source authority resolves", async () => {
    studioContext.tree = []
    const response = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(response.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/cold.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())

    expect(result.current.sourceAuthority).toBe("unknown")
    expect(result.current.isSourceEditable).toBe(false)
    act(() => {
      result.current.setContent("# Premature edit")
      result.current.setFrontmatterKey("title", "Premature")
      result.current.setFrontmatter({ title: "Premature" })
    })
    expect(result.current.content).toBe("")
    expect(result.current.frontmatter).toEqual({})
    expect(result.current.isDirty).toBe(false)

    await act(async () =>
      response.resolve({
        ok: true,
        json: async () => ({
          path: "content/cold.mdx",
          name: "cold.mdx",
          sha: "b".repeat(40),
          content: "# Supported remote",
        }),
      } as Response),
    )
    await waitFor(() => expect(result.current.sourceAuthority).toBe("editable"))
    expect(result.current.isSourceEditable).toBe(true)
  })

  it("keeps a cold existing-file read unresolved when GitHub cannot establish source authority", async () => {
    studioContext.tree = []
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/unavailable.mdx"))
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))

    expect(result.current.sourceAuthority).toBe("unknown")
    expect(result.current.isSourceEditable).toBe(false)
    act(() => result.current.setContent("# Premature edit"))
    expect(result.current.content).toBe("")
    expect(result.current.isDirty).toBe(false)
    consoleError.mockRestore()
  })

  it("does not promote a late Convex draft to cached authority after a failed cold read", async () => {
    studioContext.tree = []
    const retryResponse = deferred<Response>()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockReturnValueOnce(retryResponse.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/unavailable.mdx"))
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))
    act(() => {
      result.current.hydrateFromDocument({ body: "# Saved draft", frontmatter: { title: "Saved" } })
    })
    expect(result.current.sourceAuthority).toBe("unknown")

    act(() => result.current.navigateToFile("content/unavailable.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(result.current.sourceAuthority).toBe("unknown")
    expect(result.current.isSourceEditable).toBe(false)

    expect(result.current.content).toBe("# Saved draft")
    expect(result.current.frontmatter).toEqual({ title: "Saved" })

    await act(async () =>
      retryResponse.resolve({
        ok: true,
        json: async () => ({
          path: "content/unavailable.mdx",
          name: "unavailable.mdx",
          sha: "b".repeat(40),
          content: "# Supported Git source",
        }),
      } as Response),
    )
    await waitFor(() => expect(result.current.sourceAuthority).toBe("editable"))
    expect(result.current.content).toBe("# Saved draft")
    expect(result.current.frontmatter).toEqual({ title: "Saved" })
    consoleError.mockRestore()
  })

  it("preserves an in-flight Convex draft through an ambiguous failure and supported retry", async () => {
    studioContext.tree = []
    const firstResponse = deferred<Response>()
    const retryResponse = deferred<Response>()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(fetch).mockReturnValueOnce(firstResponse.promise).mockReturnValueOnce(retryResponse.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/retry.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    act(() => {
      result.current.hydrateFromDocument({ body: "# Convex draft", frontmatter: { title: "Draft title" } })
    })

    await act(async () => firstResponse.resolve({ ok: false, status: 500 } as Response))
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))
    expect(result.current.content).toBe("# Convex draft")
    expect(result.current.frontmatter).toEqual({ title: "Draft title" })
    expect(result.current.sourceAuthority).toBe("unknown")
    expect(result.current.isSourceEditable).toBe(false)

    act(() => result.current.navigateToFile("content/retry.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(result.current.content).toBe("# Convex draft")
    expect(result.current.frontmatter).toEqual({ title: "Draft title" })
    expect(result.current.sourceAuthority).toBe("unknown")

    await act(async () =>
      retryResponse.resolve({
        ok: true,
        json: async () => ({
          path: "content/retry.mdx",
          name: "retry.mdx",
          sha: "b".repeat(40),
          content: "# Supported Git source",
        }),
      } as Response),
    )
    await waitFor(() => expect(result.current.sourceAuthority).toBe("editable"))
    expect(result.current.content).toBe("# Convex draft")
    expect(result.current.frontmatter).toEqual({ title: "Draft title" })
    consoleError.mockRestore()
  })

  it("lets an unsupported retry outrank an in-flight Convex draft cached with unknown authority", async () => {
    studioContext.tree = []
    const firstResponse = deferred<Response>()
    const retryResponse = deferred<Response>()
    const unsupported = "export const metadata = { title: makeTitle() }\n\n# Git source\n"
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(fetch).mockReturnValueOnce(firstResponse.promise).mockReturnValueOnce(retryResponse.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/retry.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    act(() => {
      result.current.hydrateFromDocument({ body: "# Convex draft", frontmatter: { title: "Draft title" } })
    })
    await act(async () => firstResponse.resolve({ ok: false, status: 500 } as Response))
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))

    act(() => result.current.navigateToFile("content/retry.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    await act(async () =>
      retryResponse.resolve({
        ok: true,
        json: async () => ({
          path: "content/retry.mdx",
          name: "retry.mdx",
          sha: "c".repeat(40),
          content: unsupported,
        }),
      } as Response),
    )

    await waitFor(() => expect(result.current.isFileLoading).toBe(false))
    expect(result.current.content).toBe(unsupported)
    expect(result.current.frontmatter).toEqual({})
    expect(result.current.sourceAuthority).toBe("read-only")
    expect(result.current.sourceDiagnostic).toBe("UNSUPPORTED_METADATA_EXPORT")
    consoleError.mockRestore()
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
    expect(result.current.isSourceEditable).toBe(true)
    expect(result.current.sourceDiagnostic).toBeUndefined()
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
    expect(result.current.isSourceEditable).toBe(true)
    expect(result.current.sourceDiagnostic).toBeUndefined()
  })

  it("keeps unsupported metadata exports read-only and byte-for-byte source-preserved", async () => {
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
    expect(result.current.isSourceEditable).toBe(false)
    expect(result.current.sourceDiagnostic).toBe("UNSUPPORTED_METADATA_EXPORT")

    act(() => {
      result.current.setContent("# Destructive edit")
      result.current.setFrontmatterKey("title", "Fabricated")
      result.current.setFrontmatter({ title: "Fabricated" })
    })

    expect(result.current.content).toBe(source)
    expect(result.current.frontmatter).toEqual({})
    expect(result.current.isDirty).toBe(false)
  })

  it("keeps unsupported YAML read-only and byte-for-byte source-preserved", async () => {
    const source = "---\ntitle: [unterminated\n---\n# Body\n"
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
    expect(result.current.isSourceEditable).toBe(false)
    expect(result.current.sourceDiagnostic).toBe("UNSUPPORTED_FRONTMATTER")

    act(() => {
      result.current.setContent("# Destructive edit")
      result.current.setFrontmatterKey("title", "Fabricated")
      result.current.setFrontmatter({ title: "Fabricated" })
    })

    expect(result.current.content).toBe(source)
    expect(result.current.frontmatter).toEqual({})
    expect(result.current.isDirty).toBe(false)
  })

  it("lets a delayed unsupported metadata export outrank an earlier Convex draft hydration", async () => {
    studioContext.tree = []
    const source = "export const metadata = { title: makeTitle() }\n\n# Remote body\n"
    const response = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(response.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/draft.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    act(() => {
      result.current.hydrateFromDocument({
        body: "# Convex draft",
        frontmatter: { title: "Draft title" },
      })
    })

    await act(async () =>
      response.resolve({
        ok: true,
        json: async () => ({
          path: "content/draft.mdx",
          name: "draft.mdx",
          sha: "d".repeat(40),
          content: source,
        }),
      } as Response),
    )
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))

    expect(result.current.content).toBe(source)
    expect(result.current.frontmatter).toEqual({})
    expect(result.current.sha).toBe("d".repeat(40))
    expect(result.current.isSourceEditable).toBe(false)
    expect(result.current.sourceDiagnostic).toBe("UNSUPPORTED_METADATA_EXPORT")

    act(() => {
      result.current.setContent("# Destructive edit")
      result.current.setFrontmatterKey("title", "Fabricated")
      result.current.setFrontmatter({ title: "Fabricated" })
    })
    expect(result.current.content).toBe(source)
    expect(result.current.frontmatter).toEqual({})
    expect(result.current.isDirty).toBe(false)
  })

  it("lets delayed unsupported YAML outrank an earlier Convex draft hydration", async () => {
    studioContext.tree = []
    const source = "---\ntitle: [unterminated\n---\n# Remote body\n"
    const response = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(response.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/draft.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    act(() => {
      result.current.hydrateFromDocument({
        body: "# Convex draft",
        frontmatter: { title: "Draft title" },
      })
    })

    await act(async () =>
      response.resolve({
        ok: true,
        json: async () => ({
          path: "content/draft.mdx",
          name: "draft.mdx",
          sha: "e".repeat(40),
          content: source,
        }),
      } as Response),
    )
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))

    expect(result.current.content).toBe(source)
    expect(result.current.frontmatter).toEqual({})
    expect(result.current.sha).toBe("e".repeat(40))
    expect(result.current.isSourceEditable).toBe(false)
    expect(result.current.sourceDiagnostic).toBe("UNSUPPORTED_FRONTMATTER")

    act(() => {
      result.current.setContent("# Destructive edit")
      result.current.setFrontmatterKey("title", "Fabricated")
      result.current.setFrontmatter({ title: "Fabricated" })
    })
    expect(result.current.content).toBe(source)
    expect(result.current.frontmatter).toEqual({})
    expect(result.current.isDirty).toBe(false)
  })

  it("retains source-preservation state in primed cache snapshots", async () => {
    const source = "export const metadata = { title: makeTitle() }\n\n# Body\n"
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => {
      result.current.primeFileSnapshot("content/guide.mdx", {
        content: source,
        frontmatter: {},
        sha: "f".repeat(40),
        isSourceEditable: false,
        sourceDiagnostic: "UNSUPPORTED_METADATA_EXPORT",
      })
      result.current.navigateToFile("content/guide.mdx")
    })

    await waitFor(() => expect(result.current.content).toBe(source))
    expect(result.current.isSourceEditable).toBe(false)
    expect(result.current.sourceDiagnostic).toBe("UNSUPPORTED_METADATA_EXPORT")
    expect(fetch).not.toHaveBeenCalled()
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

  it("holds a late Convex draft non-writable until the cold read confirms the path is absent", async () => {
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
    expect(result.current.isDirty).toBe(false)

    await act(async () => response.resolve({ ok: false, status: 404 } as Response))
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))

    expect(result.current.content).toBe("# Saved Convex draft")
    expect(result.current.frontmatter).toEqual({ title: "Draft title" })
    expect(result.current.sha).toBeNull()
    expect(result.current.isDirty).toBe(false)
    expect(result.current.sourceAuthority).toBe("editable")
    expect(consoleError).toHaveBeenCalledWith("Failed to open file", expect.any(Error))
    consoleError.mockRestore()
  })

  it("holds a Convex draft non-writable until a supported cold read returns 200", async () => {
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
    expect(result.current.isDirty).toBe(false)

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
    })
    expect(result.current.sha).toBeNull()
    expect(result.current.isDirty).toBe(false)
    expect(result.current.sourceAuthority).toBe("editable")
  })

  it("keeps an authoritative cached supported snapshot writable during remote validation", async () => {
    studioContext.tree = []
    const response = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(response.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => {
      result.current.primeFileSnapshot("content/local.mdx", {
        content: "# Cached supported draft",
        frontmatter: { title: "Cached" },
        sha: null,
        isSourceEditable: true,
      })
      result.current.navigateToFile("content/local.mdx")
    })
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())

    expect(result.current.sourceAuthority).toBe("editable")
    expect(result.current.isSourceEditable).toBe(true)
    act(() => result.current.setContent("# Newer local edit"))
    expect(result.current.isDirty).toBe(true)

    await act(async () =>
      response.resolve({
        ok: true,
        json: async () => ({
          path: "content/local.mdx",
          name: "local.mdx",
          sha: "b".repeat(40),
          content: "# Supported remote",
        }),
      } as Response),
    )
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))
    expect(result.current.content).toBe("# Newer local edit")
    expect(result.current.isDirty).toBe(true)
  })

  it("applies a held Convex draft after a delayed supported source establishes editability", async () => {
    studioContext.tree = []
    const response = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(response.promise)
    const { result } = renderHook(() => useStudioFile(null, ""))

    act(() => result.current.navigateToFile("content/draft.mdx"))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    act(() => {
      result.current.hydrateFromDocument({
        body: "# Supported Convex draft",
        frontmatter: { title: "Supported draft title" },
      })
    })

    await act(async () =>
      response.resolve({
        ok: true,
        json: async () => ({
          path: "content/draft.mdx",
          name: "draft.mdx",
          sha: "d".repeat(40),
          content: "# Supported remote body",
        }),
      } as Response),
    )
    await waitFor(() => expect(result.current.isFileLoading).toBe(false))

    expect(result.current.content).toBe("# Supported Convex draft")
    expect(result.current.frontmatter).toEqual({ title: "Supported draft title" })
    expect(result.current.isSourceEditable).toBe(true)
    expect(result.current.sourceDiagnostic).toBeUndefined()
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

  it("does not replay the initial GitHub snapshot over a hydrated saved draft when the tree updates", async () => {
    const initialFile = {
      path: "content/guide.mdx",
      sha: "f".repeat(40),
      content: "---\ndescription: Remote description\n---\n# Remote body",
    }
    const { result, rerender } = renderHook(() => useStudioFile(initialFile, "content/guide.mdx"))

    await waitFor(() => expect(result.current.frontmatter).toEqual({ description: "Remote description" }))
    act(() => {
      result.current.hydrateFromDocument({
        body: "# Saved draft body",
        frontmatter: { description: "Saved draft description" },
      })
    })
    expect(result.current.frontmatter).toEqual({ description: "Saved draft description" })

    studioContext.tree = [...studioContext.tree]
    rerender()

    expect(result.current.content).toBe("# Saved draft body")
    expect(result.current.frontmatter).toEqual({ description: "Saved draft description" })
  })

  it("does not mark editor initialization callbacks dirty when content and frontmatter are unchanged", async () => {
    const initialFile = {
      path: "content/guide.mdx",
      sha: "f".repeat(40),
      content: "---\ndescription: Remote description\n---\n# Remote body",
    }
    const { result } = renderHook(() => useStudioFile(initialFile, "content/guide.mdx"))

    act(() => {
      result.current.setContent("# Remote body")
      result.current.setFrontmatterKey("description", "Remote description")
      result.current.setFrontmatter({ description: "Remote description" })
    })

    expect(result.current.isDirty).toBe(false)
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
