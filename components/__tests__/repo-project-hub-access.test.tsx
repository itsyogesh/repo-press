import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useQuery } from "convex/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RepoProjectHub } from "../repo-project-hub"

vi.mock("convex/react", () => ({ useQuery: vi.fn(() => false) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/dashboard/[owner]/[repo]/config-actions", () => ({
  cleanUpAllOrphansAction: vi.fn(),
  updateProjectInConfigAction: vi.fn(),
}))
vi.mock("@/lib/sync-projects", () => ({ retrySyncAction: vi.fn() }))

describe("RepoProjectHub project access", () => {
  beforeEach(() => vi.clearAllMocks())

  it("threads the matching project token through the edit-card flow", async () => {
    render(
      // biome-ignore lint/a11y/useValidAriaRole: `role` is RepoPress repository authorization, not an ARIA attribute.
      <RepoProjectHub
        owner="acme"
        repo="docs"
        defaultBranch="main"
        projects={[
          {
            _id: "project-1",
            userId: "user-1",
            name: "Docs",
            branch: "main",
            contentRoot: "content",
            detectedFramework: "next-mdx",
            contentType: "docs",
            frameworkSource: "config",
            configProjectId: "docs",
            createdAt: 1,
            updatedAt: 2,
          },
        ]}
        hasConfig
        configSynced
        syncError={null}
        isWriter
        role="owner"
        configJson={null}
        configSha={null}
        actingUserId="user-1"
        projectAccessTokens={{ "project-1": "project-token" }}
      />,
    )

    fireEvent.pointerDown(screen.getByRole("button", { name: "Project actions" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }))

    await waitFor(() =>
      expect(
        vi.mocked(useQuery).mock.calls.some((call) => {
          const args = call[1]
          return (
            typeof args === "object" &&
            args !== null &&
            "projectId" in args &&
            args.projectId === "project-1" &&
            "projectAccessToken" in args &&
            args.projectAccessToken === "project-token"
          )
        }),
      ).toBe(true),
    )
  })
})
