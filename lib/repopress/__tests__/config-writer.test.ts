import { describe, expect, it } from "vitest"
import type { RepoPressConfig } from "@/lib/config-schema"
import { addProject, removeProject, updateProject } from "../config-writer"

function makeConfig(overrides?: Partial<RepoPressConfig>): RepoPressConfig {
  return {
    version: 1,
    projects: [
      {
        id: "docs",
        name: "Documentation",
        contentRoot: "content/docs",
        framework: "fumadocs",
        contentType: "docs",
      },
    ],
    ...overrides,
  }
}

describe("addProject", () => {
  it("appends a new project to the config", () => {
    const config = makeConfig()
    const result = addProject(config, {
      id: "blog",
      name: "Blog",
      contentRoot: "content/blog",
      framework: "custom",
      contentType: "blog",
    })

    expect(result.projects).toHaveLength(2)
    expect(result.projects[1].id).toBe("blog")
    expect(result.projects[1].name).toBe("Blog")
  })

  it("rejects duplicate project id", () => {
    const config = makeConfig()
    expect(() =>
      addProject(config, {
        id: "docs",
        name: "Another Docs",
        contentRoot: "other-path",
        framework: "auto",
        contentType: "docs",
      }),
    ).toThrow('Project with id "docs" already exists')
  })

  it("rejects duplicate contentRoot + branch combination", () => {
    const config = makeConfig()
    expect(() =>
      addProject(config, {
        id: "docs-copy",
        name: "Docs Copy",
        contentRoot: "content/docs",
        framework: "auto",
        contentType: "docs",
      }),
    ).toThrow('A project with contentRoot "content/docs"')
  })

  it("validates output with Zod (rejects invalid config)", () => {
    const config = makeConfig()
    // A project with all required fields should pass Zod validation
    const result = addProject(config, {
      id: "valid",
      name: "Valid Project",
      contentRoot: "x",
      framework: "auto",
      contentType: "custom",
    })
    expect(result.projects).toHaveLength(2)
  })
})

describe("updateProject", () => {
  it("updates existing project fields", () => {
    const config = makeConfig()
    const result = updateProject(config, "docs", { name: "New Docs Name", framework: "nextra" })

    expect(result.projects[0].name).toBe("New Docs Name")
    expect(result.projects[0].framework).toBe("nextra")
    expect(result.projects[0].contentRoot).toBe("content/docs") // unchanged
  })

  it("throws for unknown project id", () => {
    const config = makeConfig()
    expect(() => updateProject(config, "nonexistent", { name: "Foo" })).toThrow(
      'Project "nonexistent" not found in config',
    )
  })

  it("does not modify other projects", () => {
    const config = makeConfig({
      projects: [
        { id: "a", name: "A", contentRoot: "a", framework: "auto", contentType: "docs" },
        { id: "b", name: "B", contentRoot: "b", framework: "auto", contentType: "blog" },
      ],
    })
    const result = updateProject(config, "a", { name: "Updated A" })
    expect(result.projects[0].name).toBe("Updated A")
    expect(result.projects[1].name).toBe("B")
  })
})

describe("removeProject", () => {
  it("removes the specified project", () => {
    const config = makeConfig({
      projects: [
        { id: "docs", name: "Docs", contentRoot: "docs", framework: "auto", contentType: "docs" },
        { id: "blog", name: "Blog", contentRoot: "blog", framework: "auto", contentType: "blog" },
      ],
    })
    const result = removeProject(config, "docs")
    expect(result.projects).toHaveLength(1)
    expect(result.projects[0].id).toBe("blog")
  })

  it("throws for unknown project id", () => {
    const config = makeConfig()
    expect(() => removeProject(config, "nonexistent")).toThrow('Project "nonexistent" not found in config')
  })

  it("throws when removing the last project (Zod min 1)", () => {
    const config = makeConfig()
    expect(() => removeProject(config, "docs")).toThrow()
  })

  it("preserves other config fields", () => {
    const config = makeConfig({
      defaults: { branch: "develop" },
      projects: [
        { id: "a", name: "A", contentRoot: "a", framework: "auto", contentType: "docs" },
        { id: "b", name: "B", contentRoot: "b", framework: "auto", contentType: "blog" },
      ],
    })
    const result = removeProject(config, "a")
    expect(result.defaults?.branch).toBe("develop")
    expect(result.version).toBe(1)
  })
})
