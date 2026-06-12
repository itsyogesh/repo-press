import { describe, expect, it, vi } from "vitest"

const { getFileMock } = vi.hoisted(() => ({
  getFileMock: vi.fn(),
}))

vi.mock("@/lib/github", () => ({
  getFile: getFileMock,
}))

import { collectRepoModuleBundle } from "../repo-module-bundle"

describe("collectRepoModuleBundle", () => {
  it("collects alias imports relative to the runtime root and continues walking nested imports", async () => {
    const files: Record<string, string> = {
      "apps/docs/mdx-components.tsx": `
        import { Callout } from "@/components/callout"
        export function getMDXComponents(components) {
          return { ...components, Callout }
        }
      `,
      "apps/docs/components/callout.tsx": `
        import { label } from "./nested"
        export const Callout = () => label
      `,
      "apps/docs/components/nested.ts": 'export const label = "nested"',
    }

    getFileMock.mockImplementation(async (_token, _owner, _repo, filePath: string) => {
      const content = files[filePath]
      return content === undefined ? null : { content, sha: `sha-${filePath}` }
    })

    const bundle = await collectRepoModuleBundle({
      token: "token",
      owner: "opentribe-dao",
      repo: "opentribe",
      branch: "main",
      entryPath: "apps/docs/mdx-components.tsx",
      runtimeRoot: "apps/docs",
    })

    expect(bundle.sources).toMatchObject(files)
    expect(bundle.entryPath).toBe("apps/docs/mdx-components.tsx")
    expect(bundle.entrySource).toBe(files["apps/docs/mdx-components.tsx"])
  })

  it("resolves ~/ alias imports relative to the runtime root", async () => {
    const files: Record<string, string> = {
      "apps/docs/mdx-components.tsx": `import { label } from "~/lib/label"\nexport const x = label`,
      "apps/docs/lib/label.ts": 'export const label = "hi"',
    }
    getFileMock.mockImplementation(async (_t, _o, _r, filePath: string) =>
      files[filePath] === undefined ? null : { content: files[filePath], sha: `sha-${filePath}` },
    )

    const bundle = await collectRepoModuleBundle({
      token: "token",
      owner: "o",
      repo: "r",
      branch: "main",
      entryPath: "apps/docs/mdx-components.tsx",
      runtimeRoot: "apps/docs",
    })

    expect(bundle.sources["apps/docs/lib/label.ts"]).toBe(files["apps/docs/lib/label.ts"])
  })

  it("throws when the entry module does not exist", async () => {
    getFileMock.mockResolvedValue(null)

    await expect(
      collectRepoModuleBundle({
        token: "token",
        owner: "o",
        repo: "r",
        branch: "main",
        entryPath: "missing/entry.tsx",
        runtimeRoot: "missing",
      }),
    ).rejects.toThrow("Module not found at missing/entry.tsx")
  })

  it("throws when a relative import cannot be resolved", async () => {
    const files: Record<string, string> = {
      "apps/docs/mdx-components.tsx": `import { gone } from "./does-not-exist"\nexport const x = gone`,
    }
    getFileMock.mockImplementation(async (_t, _o, _r, filePath: string) =>
      files[filePath] === undefined ? null : { content: files[filePath], sha: `sha-${filePath}` },
    )

    await expect(
      collectRepoModuleBundle({
        token: "token",
        owner: "o",
        repo: "r",
        branch: "main",
        entryPath: "apps/docs/mdx-components.tsx",
        runtimeRoot: "apps/docs",
      }),
    ).rejects.toThrow("Unable to resolve ./does-not-exist from apps/docs/mdx-components.tsx")
  })

  it("terminates on circular imports", async () => {
    const files: Record<string, string> = {
      "apps/docs/a.tsx": `import { b } from "./b"\nexport const a = b`,
      "apps/docs/b.tsx": `import { a } from "./a"\nexport const b = a`,
    }
    getFileMock.mockImplementation(async (_t, _o, _r, filePath: string) =>
      files[filePath] === undefined ? null : { content: files[filePath], sha: `sha-${filePath}` },
    )

    const bundle = await collectRepoModuleBundle({
      token: "token",
      owner: "o",
      repo: "r",
      branch: "main",
      entryPath: "apps/docs/a.tsx",
      runtimeRoot: "apps/docs",
    })

    expect(Object.keys(bundle.sources).sort()).toEqual(["apps/docs/a.tsx", "apps/docs/b.tsx"])
  })
})
