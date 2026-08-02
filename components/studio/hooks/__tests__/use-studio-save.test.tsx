import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getOrCreateDocumentMock, saveDraftMutationMock } = vi.hoisted(() => ({
  getOrCreateDocumentMock: vi.fn(),
  saveDraftMutationMock: vi.fn(),
}))

vi.mock("convex/react", () => ({
  useMutation: vi.fn().mockReturnValueOnce(getOrCreateDocumentMock).mockReturnValueOnce(saveDraftMutationMock),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("../../studio-context", () => ({
  useStudio: () => ({ projectId: "project_123", contentRoot: "content/docs" }),
}))

import { useStudioSave } from "../use-studio-save"

describe("useStudioSave path boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getOrCreateDocumentMock.mockResolvedValue("doc_123")
  })

  it("stores the selected GitHub tree file as a content-relative document path", async () => {
    let hookState: ReturnType<typeof useStudioSave> | null = null

    function Harness() {
      hookState = useStudioSave({
        userId: "user_owner",
        selectedFile: {
          name: "start.mdx",
          path: "content/docs/guides/start.mdx",
          sha: "github-sha",
          type: "file",
        },
        content: "# Start",
        frontmatter: { title: "Start" },
        sha: "github-sha",
      })
      return null
    }

    renderToStaticMarkup(<Harness />)
    await hookState!.ensureDocumentRecord()

    expect(getOrCreateDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_123",
        filePath: "guides/start.mdx",
        pathRepresentation: "content_relative_v1",
        githubSha: "github-sha",
      }),
    )
  })
})
