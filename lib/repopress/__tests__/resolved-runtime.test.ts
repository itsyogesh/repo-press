import { describe, expect, it } from "vitest"
import { type RepoPressResolvedRuntime, type ResolveRuntimeOptions, resolveResolvedRuntime } from "../resolved-runtime"

function createReadFile(existingPaths: string[]) {
  const fileSet = new Set(existingPaths)
  return async (path: string) => {
    return fileSet.has(path) ? `// ${path}` : null
  }
}

async function resolveRuntime(
  overrides: Partial<ResolveRuntimeOptions> & Pick<ResolveRuntimeOptions, "framework" | "contentRoot">,
) {
  return resolveResolvedRuntime({
    owner: "acme",
    repo: "docs",
    branch: "main",
    readFile: createReadFile([]),
    ...overrides,
  })
}

describe("resolveResolvedRuntime", () => {
  it("prefers the nearest native mdx-components file for nested docs roots", async () => {
    const runtime = await resolveResolvedRuntime({
      owner: "acme",
      repo: "docs",
      branch: "main",
      framework: "fumadocs",
      contentRoot: "apps/docs/content/docs",
      readFile: createReadFile(["apps/docs/mdx-components.tsx"]),
    })

    expect(runtime).toEqual<RepoPressResolvedRuntime>({
      strategy: "native",
      entryPath: "apps/docs/mdx-components.tsx",
      rootPath: "apps/docs",
      metadataDefault: "frontmatter",
      extensions: [".md", ".mdx", ".markdown"],
    })
  })

  it("uses metadata-export defaults for Next app-based MDX roots", async () => {
    const runtime = await resolveResolvedRuntime({
      owner: "itsyogesh",
      repo: "merry-magic-mail",
      branch: "main",
      framework: "next-mdx",
      contentRoot: "app/(main)/blog",
      readFile: createReadFile(["mdx-components.tsx"]),
    })

    expect(runtime).toEqual<RepoPressResolvedRuntime>({
      strategy: "native",
      entryPath: "mdx-components.tsx",
      rootPath: "",
      metadataDefault: "metadata-export",
      extensions: [".md", ".mdx", ".markdown"],
    })
  })

  it("resolves opentribe-style app docs roots to the app-local native runtime", async () => {
    const runtime = await resolveResolvedRuntime({
      owner: "opentribe-dao",
      repo: "opentribe",
      branch: "main",
      framework: "fumadocs",
      contentRoot: "apps/docs/content/docs",
      readFile: createReadFile(["mdx-components.tsx", "apps/docs/mdx-components.tsx"]),
    })

    expect(runtime).toMatchObject({
      strategy: "native",
      entryPath: "apps/docs/mdx-components.tsx",
      rootPath: "apps/docs",
    })
  })

  it("resolves contentlayer projects to nearest mdx-components runtime when present", async () => {
    const runtime = await resolveResolvedRuntime({
      owner: "acme",
      repo: "contentlayer-site",
      branch: "main",
      framework: "contentlayer",
      contentRoot: "apps/web/content/blog",
      readFile: createReadFile(["apps/web/contentlayer.config.ts", "apps/web/mdx-components.tsx"]),
    })

    expect(runtime).toMatchObject({
      strategy: "native",
      entryPath: "apps/web/mdx-components.tsx",
      rootPath: "apps/web",
    })
  })

  it("honors explicit preview overrides ahead of native detection", async () => {
    const runtime = await resolveResolvedRuntime({
      owner: "acme",
      repo: "docs",
      branch: "main",
      framework: "fumadocs",
      contentRoot: "apps/docs/content/docs",
      overrideEntry: ".repopress/mdx-preview.tsx",
      readFile: createReadFile(["apps/docs/mdx-components.tsx"]),
    })

    expect(runtime).toEqual<RepoPressResolvedRuntime>({
      strategy: "override",
      entryPath: ".repopress/mdx-preview.tsx",
      rootPath: ".repopress",
      metadataDefault: "frontmatter",
      extensions: [".md", ".mdx", ".markdown"],
    })
  })

  it("honors explicit preview overrides even for markdown-first frameworks", async () => {
    const runtime = await resolveResolvedRuntime({
      owner: "acme",
      repo: "jekyll-site",
      branch: "main",
      framework: "jekyll",
      contentRoot: "_posts",
      overrideEntry: ".repopress/mdx-preview.tsx",
      readFile: createReadFile([]),
    })

    expect(runtime).toMatchObject({
      strategy: "override",
      entryPath: ".repopress/mdx-preview.tsx",
      rootPath: ".repopress",
    })
  })

  it("falls back to generic markdown behavior for markdown-first frameworks", async () => {
    const runtime = await resolveRuntime({
      framework: "hugo",
      contentRoot: "content/posts",
    })

    expect(runtime).toEqual<RepoPressResolvedRuntime>({
      strategy: "generic-fallback",
      entryPath: null,
      rootPath: null,
      metadataDefault: "frontmatter",
      extensions: [".md", ".mdx", ".markdown"],
    })
  })
})
