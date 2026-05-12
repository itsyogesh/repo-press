// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}))

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("@/app/dashboard/[owner]/[repo]/config-actions", () => ({
  updateProjectInConfigAction: vi.fn(),
}))

import { EditProjectDialog } from "../edit-project-dialog"

describe("EditProjectDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useQueryMock.mockReturnValue(false)
  })

  it("passes projectAccessToken to the hasContent query", () => {
    render(
      <EditProjectDialog
        owner="acme"
        repo="docs"
        defaultBranch="main"
        project={{
          _id: "project_123",
          name: "Docs",
          contentRoot: "",
          contentType: "docs",
          branch: "main",
          configProjectId: "docs",
          projectAccessToken: "pat-token",
        }}
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: "project_123",
        projectAccessToken: "pat-token",
      }),
    )
  })
})
