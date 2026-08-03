import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const BASE_SHA = "b".repeat(40)
const { useQueryMock, useMutationMock, useConvexMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useMutationMock: vi.fn(),
  useConvexMock: vi.fn(),
}))

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
  useMutation: useMutationMock,
  useConvex: useConvexMock,
  useAction: vi.fn(),
}))

import { GalleryTab } from "../gallery-tab"

describe("GalleryTab immutable read authority", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useQueryMock.mockReturnValueOnce({ page: [], continueCursor: null, isDone: true }).mockReturnValueOnce([])
    useMutationMock.mockReturnValue(vi.fn())
    useConvexMock.mockReturnValue({ query: vi.fn() })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ found: 0, inserted: 0, updated: 0 }) }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("pins repository scans to the Studio base commit while retaining branch authority", async () => {
    render(
      <GalleryTab
        projectId="project_123"
        owner="acme"
        repo="docs"
        branch="release"
        baseCommitSha={BASE_SHA}
        onSelect={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByRole("button", { name: "Scan Repo" })[0])

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({
      branch: "release",
      readRef: BASE_SHA,
    })
  })
})
