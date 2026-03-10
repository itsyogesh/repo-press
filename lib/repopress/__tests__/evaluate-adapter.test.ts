import { describe, expect, it } from "vitest"
import { transpileAdapter } from "../esbuild-browser"
import { evaluateAdapter } from "../evaluate-adapter"

describe("evaluateAdapter", () => {
  it("reads default exports from bundled CommonJS output", async () => {
    const code = await transpileAdapter({
      entryPath: "mdx-preview.tsx",
      sources: {
        "mdx-preview.tsx": 'export default { scope: { greeting: "hello" } }',
      },
    })

    const adapter = evaluateAdapter(code)

    expect(adapter.scope?.greeting).toBe("hello")
  })

  it("bundles relative imports from repo-local sources", async () => {
    const code = await transpileAdapter({
      entryPath: "plugins/demo.tsx",
      sources: {
        "plugins/demo.tsx": 'import { answer } from "./shared"; export const adapter = { scope: { answer } }',
        "plugins/shared.ts": "export const answer = 42",
      },
    })

    const adapter = evaluateAdapter(code)

    expect(adapter.scope?.answer).toBe(42)
  })

  it("suppresses constructor access through the React object during evaluation", async () => {
    const code = await transpileAdapter({
      entryPath: "mdx-preview.tsx",
      sources: {
        "mdx-preview.tsx": "export const adapter = { scope: { ctorType: typeof React.createElement.constructor } }",
      },
    })

    const adapter = evaluateAdapter(code)

    expect(adapter.scope?.ctorType).toBe("undefined")
  })
})
