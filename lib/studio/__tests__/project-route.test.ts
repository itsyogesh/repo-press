import { describe, expect, it } from "vitest"
import { projectMatchesRoute, selectRequestedStudioProject, selectStudioFallbackProject } from "../project-route"

describe("projectMatchesRoute", () => {
  it("accepts a matching owner/repo/branch triplet", () => {
    expect(
      projectMatchesRoute(
        {
          repoOwner: "acme",
          repoName: "docs-site",
          branch: "main",
        },
        "acme",
        "docs-site",
        "main",
      ),
    ).toBe(true)
  })

  it("rejects mismatched repo routes", () => {
    expect(
      projectMatchesRoute(
        {
          repoOwner: "other",
          repoName: "docs-site",
          branch: "main",
        },
        "acme",
        "docs-site",
        "main",
      ),
    ).toBe(false)
  })
})

describe("selectStudioFallbackProject", () => {
  it("returns the sole project on the requested branch", () => {
    expect(
      selectStudioFallbackProject(
        [
          { _id: "project_1", repoOwner: "acme", repoName: "docs-site", branch: "main" },
          { _id: "project_2", repoOwner: "acme", repoName: "docs-site", branch: "dev" },
        ],
        "main",
      )?._id,
    ).toBe("project_1")
  })

  it("refuses ambiguous fallback when multiple projects share the branch", () => {
    expect(
      selectStudioFallbackProject(
        [
          { _id: "project_1", repoOwner: "acme", repoName: "docs-site", branch: "main" },
          { _id: "project_2", repoOwner: "acme", repoName: "docs-site", branch: "main" },
        ],
        "main",
      ),
    ).toBeNull()
  })
})

describe("selectRequestedStudioProject", () => {
  it("accepts an explicit matching project even when fallback would be ambiguous", () => {
    expect(
      selectRequestedStudioProject(
        { _id: "project_2", repoOwner: "acme", repoName: "docs-site", branch: "main" },
        "acme",
        "docs-site",
        "main",
      )?._id,
    ).toBe("project_2")
  })
})
