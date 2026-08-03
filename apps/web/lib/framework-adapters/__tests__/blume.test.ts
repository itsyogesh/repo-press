import { beforeEach, describe, expect, it, vi } from "vitest"

const { getFileContent, getRepoContents } = vi.hoisted(() => ({
  getFileContent: vi.fn(),
  getRepoContents: vi.fn(),
}))

vi.mock("@/lib/github", () => ({ getFileContent, getRepoContents }))

import { detectFramework, getFrameworkConfig } from "../registry"

type RepositoryFixture = {
  files?: Record<string, string>
  folders?: Record<string, string[]>
}

function useRepository({ files = {}, folders = {} }: RepositoryFixture) {
  getFileContent.mockImplementation(async (_token, _owner, _repo, path) => files[path] ?? null)
  getRepoContents.mockImplementation(async (_token, _owner, _repo, path) =>
    (folders[path] ?? []).map((name) => ({ name })),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Blume framework adapter", () => {
  it("detects a root Blume project and suggests its workspace-relative content folder", async () => {
    useRepository({
      files: {
        "package.json": JSON.stringify({ dependencies: { astro: "^5", blume: "^1.1.4" } }),
      },
      folders: { "": ["package.json", "astro.config.mjs", "blume.config.ts", "content"] },
    })

    await expect(detectFramework("token", "acme", "docs", "main")).resolves.toMatchObject({
      framework: "blume",
      displayName: "Blume",
      contentType: "docs",
      suggestedContentRoots: ["content"],
    })
  })

  it("treats a declared Blume package as authoritative over its underlying Astro runtime", async () => {
    useRepository({
      files: {
        "package.json": JSON.stringify({ dependencies: { astro: "^5", blume: "^1.1.4" } }),
      },
      folders: { "": ["package.json", "astro.config.mjs", "content"] },
    })

    await expect(detectFramework("token", "acme", "docs", "main")).resolves.toMatchObject({
      framework: "blume",
      suggestedContentRoots: ["content"],
    })
  })

  it("detects the conventional apps/docs Blume workspace from its config or package declaration", async () => {
    useRepository({
      files: {
        "package.json": JSON.stringify({ workspaces: ["apps/*"] }),
        "apps/docs/package.json": JSON.stringify({ devDependencies: { blume: "^1.1.4" } }),
        "apps/docs/blume.config.ts": 'import { defineConfig } from "blume"',
      },
      folders: { "": ["package.json", "apps"] },
    })

    await expect(detectFramework("token", "acme", "monorepo", "main")).resolves.toMatchObject({
      framework: "blume",
      suggestedContentRoots: ["apps/docs/content"],
    })
  })

  it("recognizes a nested Blume config without requiring a nested package declaration", async () => {
    useRepository({
      files: {
        "package.json": JSON.stringify({ workspaces: ["apps/*"] }),
        "apps/docs/blume.config.mjs": "export default {}",
      },
      folders: { "": ["package.json", "apps"] },
    })

    await expect(detectFramework("token", "acme", "monorepo", "main")).resolves.toMatchObject({
      framework: "blume",
      suggestedContentRoots: ["apps/docs/content"],
    })
  })

  it("does not change detection for Astro, Fumadocs, or custom repositories", async () => {
    useRepository({
      files: { "package.json": JSON.stringify({ dependencies: { astro: "^5" } }) },
      folders: { "": ["package.json", "astro.config.mjs"] },
    })
    await expect(detectFramework("token", "acme", "astro", "main")).resolves.toMatchObject({ framework: "astro" })

    useRepository({
      files: { "package.json": JSON.stringify({ dependencies: { "fumadocs-core": "^15" } }) },
      folders: { "": ["package.json", "source.config.ts"] },
    })
    await expect(detectFramework("token", "acme", "fuma", "main")).resolves.toMatchObject({ framework: "fumadocs" })

    useRepository({ files: { "package.json": "{}" }, folders: { "": ["README.md"] } })
    await expect(detectFramework("token", "acme", "plain", "main")).resolves.toMatchObject({ framework: "custom" })
  })

  it("exposes Blume metadata through the stored-project adapter path", () => {
    expect(getFrameworkConfig("blume")).toMatchObject({
      framework: "blume",
      displayName: "Blume",
      contentType: "docs",
      suggestedContentRoots: ["content", "apps/docs/content"],
    })
  })
})
