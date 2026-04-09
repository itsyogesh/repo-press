import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { saveDraftMutationMock, toastMock } = vi.hoisted(() => {
  const toastFn = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  })

  return {
    saveDraftMutationMock: vi.fn(),
    toastMock: toastFn,
  }
})

vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => saveDraftMutationMock),
}))

vi.mock("sonner", () => ({
  toast: toastMock,
}))

vi.mock("../../studio-context", () => ({
  useStudio: () => ({ projectId: "project_123" }),
}))

import { useStudioPublish } from "../use-studio-publish"

describe("useStudioPublish", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saveDraftMutationMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("surfaces publish warnings while still showing the success toast", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        ok: true,
        prUrl: "https://github.com/acme/docs-site/pull/42",
        warning: "Commit pushed, but updating the existing PR title/description failed.",
      }),
    } as never)

    let hookState: ReturnType<typeof useStudioPublish> | null = null

    function Harness() {
      hookState = useStudioPublish({
        userId: "user_owner",
        projectAccessToken: null,
        documentUpdatedAt: null,
        ensureDocumentRecord: vi.fn().mockResolvedValue(null),
        selectedFile: null,
        content: "# Hello",
        frontmatter: {},
        defaultPublishMode: "reuse-current",
      })
      return null
    }

    renderToStaticMarkup(<Harness />)

    expect(hookState).not.toBeNull()

    await hookState!.handlePublish("docs: tighten publish UX (PR from RepoPress)", "Refresh publish copy.")

    expect(fetchMock).toHaveBeenCalled()
    expect(toastMock.success).toHaveBeenCalledWith("Pushed to PR")
    expect(toastMock).toHaveBeenCalledWith("Commit pushed, but updating the existing PR title/description failed.")
  })
})
