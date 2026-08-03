import { render } from "@testing-library/react"
import { useQuery } from "convex/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EditProjectDialog } from "../edit-project-dialog"

vi.mock("convex/react", () => ({ useQuery: vi.fn(() => false) }))
vi.mock("@/app/dashboard/[owner]/[repo]/config-actions", () => ({ updateProjectInConfigAction: vi.fn() }))

describe("EditProjectDialog project access", () => {
  beforeEach(() => vi.clearAllMocks())

  it("authorizes the content query with the exact project id and token", () => {
    render(
      <EditProjectDialog
        owner="acme"
        repo="docs"
        defaultBranch="main"
        project={{
          _id: "project-1",
          name: "Docs",
          contentRoot: "content",
          contentType: "docs",
          branch: "main",
          configProjectId: "docs",
          projectAccessToken: "project-token",
        }}
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(vi.mocked(useQuery).mock.calls[0][1]).toEqual({
      projectId: "project-1",
      projectAccessToken: "project-token",
    })
  })
})
