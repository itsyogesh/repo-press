import { render, screen } from "@testing-library/react"
import { createElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { buildAddProjectActionInput, buildUpdateProjectActionInput } from "@/components/project-config-action-input"
import { RepoSetupForm } from "@/components/repo-setup-form"

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: () => null,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("@/app/dashboard/[owner]/[repo]/init-actions", () => ({ initRepoPressAction: vi.fn() }))
vi.mock("@/lib/sync-projects", () => ({ retrySyncAction: vi.fn() }))

describe("project config action inputs", () => {
  it("keeps config writes on the default branch when adding a branched project", () => {
    const result = buildAddProjectActionInput({
      defaultBranch: "main",
      name: "Release Docs",
      contentRoot: "content/docs",
      framework: "fumadocs",
      contentType: "docs",
      branchInput: "release-docs",
    })

    expect(result.configBranch).toBe("main")
    expect(result.project).toEqual({
      id: "release-docs",
      name: "Release Docs",
      contentRoot: "content/docs",
      framework: "fumadocs",
      contentType: "docs",
      branch: "release-docs",
    })
  })

  it("keeps config writes on the default branch when editing a branched project", () => {
    const result = buildUpdateProjectActionInput({
      configProjectId: "docs",
      defaultBranch: "main",
      name: "Documentation",
      framework: "fumadocs",
      contentType: "docs",
      branchInput: "release-docs",
    })

    expect(result.configBranch).toBe("main")
    expect(result.configProjectId).toBe("docs")
    expect(result.updates).toEqual({
      name: "Documentation",
      framework: "fumadocs",
      contentType: "docs",
      branch: "release-docs",
    })
  })

  it("describes setup as native discovery without promising a generated preview adapter", () => {
    render(
      createElement(RepoSetupForm, {
        owner: "acme",
        repo: "docs",
        branches: [{ name: "main" }],
        defaultBranch: "main",
        frameworkConfig: {
          framework: "fumadocs",
          contentType: "docs",
          suggestedContentRoots: ["content/docs"],
          frontmatterFields: [],
          metaFilePattern: null,
        },
      }),
    )

    expect(screen.getByText(/adds a lightweight project config/i)).toBeTruthy()
    expect(screen.getByText(/discovers your existing MDX setup/i)).toBeTruthy()
    expect(screen.queryByText(/adds a config file and preview adapter/i)).toBeNull()
  })
})
