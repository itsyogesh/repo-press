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
  })
})
