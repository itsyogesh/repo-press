import { describe, expect, it } from "vitest"
import { buildAddProjectActionInput, buildUpdateProjectActionInput } from "@/components/project-config-action-input"

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
})
