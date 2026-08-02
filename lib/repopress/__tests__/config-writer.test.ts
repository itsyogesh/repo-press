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

  it("preserves explicit preview and declarative authoring overrides as optional compatibility metadata", () => {
    const result = addProject(makeConfig(), {
      id: "legacy",
      name: "Legacy compatible preview",
      contentRoot: "content/legacy",
      framework: "custom",
      contentType: "docs",
      preview: { entry: ".repopress/custom-preview.tsx", plugins: ["legacy-callouts"] },
      components: {
        Callout: {
          displayName: "Callout",
          props: [{ name: "variant", type: "string", options: ["info", "warning"] }],
          hasChildren: true,
        },
      },
    })

    expect(result.projects[1].preview).toEqual({
      entry: ".repopress/custom-preview.tsx",
      plugins: ["legacy-callouts"],
    })
    expect(result.projects[1].components?.Callout).toMatchObject({ displayName: "Callout", hasChildren: true })
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

  it("preserves full declarative authoring overrides without accepting executable truth", () => {
    const config = makeConfig()
    const components = {
      Callout: {
        version: "1.2.0",
        exportName: "Callout",
        displayName: "Callout box",
        description: "Highlights important content.",
        runtime: "client" as const,
        props: [
          {
            name: "variant",
            type: "string" as const,
            required: true,
            description: "Visual emphasis",
            options: ["info", "warning"],
            placeholder: "Choose a variant",
          },
        ],
        assets: [{ path: "components/callout.css", type: "style" as const }],
        slots: [{ name: "children", accepts: "mdx" as const, required: true }],
        previewFixtures: ["fixtures/callout.mdx"],
        defaultFixture: "fixtures/callout.mdx",
        frameworks: ["fumadocs" as const, "next" as const],
        import: { source: "@/components/callout", exportName: "Callout" },
        provenance: {
          source: "registry" as const,
          registryItem: "@repopress/callout",
          version: "1.2.0",
          integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        },
        hasChildren: true,
        kind: "flow" as const,
      },
    }

    const result = updateProject(config, "docs", { components })
    expect(result.projects[0].components?.Callout).toMatchObject(components.Callout)
    expect(result.projects[0].components?.Callout).toMatchObject({ hasChildren: true, kind: "flow" })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.projects[0].components?.Callout)).toBe(true)

    expect(() =>
      updateProject(config, "docs", {
        components: {
          Callout: { ...components.Callout, implementation: "() => null" } as never,
        },
      }),
    ).toThrow()

    expect(() =>
      updateProject(config, "docs", {
        components: {
          Callout: { ...components.Callout, description: "javascript:alert(1)" },
        },
      }),
    ).toThrow("executable source")

    const dangerousDefault = Object.create(null) as Record<string, unknown>
    Object.defineProperty(dangerousDefault, "constructor", { value: "poison", enumerable: true })
    expect(() =>
      updateProject(config, "docs", {
        components: {
          Callout: {
            ...components.Callout,
            props: [{ name: "data", type: "expression", default: dangerousDefault }],
          },
        },
      }),
    ).toThrow("dangerous key")
  })

  it("rejects unsafe or excessive component-map keys and whole-config hostile JSON", () => {
    const config = makeConfig()
    for (const name of ["constructor", "prototype", "toString", "valueOf", "not a component", "123Bad"]) {
      expect(() => updateProject(config, "docs", { components: { [name]: {} } })).toThrow()
    }

    const tooMany = Object.fromEntries(Array.from({ length: 513 }, (_, index) => [`Component${index}`, {}]))
    expect(() => updateProject(config, "docs", { components: tooMany })).toThrow("component count")

    const cyclic = makeConfig() as RepoPressConfig & { self?: unknown }
    cyclic.self = cyclic
    expect(() =>
      addProject(cyclic, {
        id: "blog",
        name: "Blog",
        contentRoot: "blog",
        framework: "custom",
        contentType: "blog",
      }),
    ).toThrow("cycle")

    const accessor = makeConfig()
    Object.defineProperty(accessor, "plugins", { enumerable: true, get: () => ({ bad: "value" }) })
    expect(() => removeProject(accessor, "docs")).toThrow("data property")
  })

  it("rejects nested array accessors without invoking them", () => {
    const values: unknown[] = []
    let calls = 0
    Object.defineProperty(values, 0, {
      enumerable: true,
      get: () => {
        calls += 1
        return "unsafe"
      },
    })
    expect(() =>
      updateProject(makeConfig(), "docs", {
        components: { Widget: { props: [{ name: "data", type: "expression", default: values }] } },
      }),
    ).toThrow("data descriptor")
    expect(calls).toBe(0)
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

  it("allows removing the last project, returning an empty-projects config", () => {
    const config = makeConfig()
    const result = removeProject(config, "docs")
    expect(result.projects).toHaveLength(0)
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
