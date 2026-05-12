// @vitest-environment node
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

  it("bundles repo-local alias imports relative to the native runtime root", async () => {
    const code = await transpileAdapter({
      entryPath: "apps/docs/mdx-components.tsx",
      runtimeRoot: "apps/docs",
      sources: {
        "apps/docs/mdx-components.tsx": `
          import { Callout } from "@/components/callout"

          export function getMDXComponents(components) {
            return { ...components, Callout }
          }
        `,
        "apps/docs/components/callout.tsx": "export const Callout = (props) => props.children",
      },
    })

    const adapter = evaluateAdapter(code)

    expect(adapter.components?.Callout).toBeDefined()
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

  it("derives components from a native useMDXComponents export", async () => {
    const code = await transpileAdapter({
      entryPath: "mdx-components.tsx",
      sources: {
        "mdx-components.tsx": `
          import Link from "next/link"

          export function useMDXComponents(components) {
            return {
              ...components,
              Link,
            }
          }
        `,
      },
    })

    const adapter = evaluateAdapter(code)

    expect(adapter.components?.Link).toBeDefined()
  })

  it("derives components from a native getMDXComponents export", async () => {
    const code = await transpileAdapter({
      entryPath: "mdx-components.tsx",
      sources: {
        "mdx-components.tsx": `
          import { defaultComponents } from "fumadocs-ui/mdx"

          export function getMDXComponents() {
            return {
              ...defaultComponents,
            }
          }
        `,
      },
    })

    const adapter = evaluateAdapter(code)

    expect(adapter.components?.Callout).toBeDefined()
  })

  it("provides a next/image shim for native runtimes", async () => {
    const code = await transpileAdapter({
      entryPath: "mdx-components.tsx",
      sources: {
        "mdx-components.tsx": `
          import Image from "next/image"

          export const adapter = {
            components: {
              Image,
            },
          }
        `,
      },
    })

    const adapter = evaluateAdapter(code)

    expect(adapter.components?.Image).toBeDefined()
  })
})
