import { describe, expect, it } from "vitest"
import { buildMergedContext } from "../preview-context"

describe("buildMergedContext", () => {
  it("lets the project adapter override plugin exports", () => {
    const merged = buildMergedContext(
      {
        components: {
          Callout: () => null,
        },
        scope: {
          greeting: "adapter",
        },
        allowImports: {
          demo: {
            Button: "adapter-button",
          },
        },
        resolveAssetUrl: (value) => `adapter:${value}`,
      },
      {
        pluginA: {
          components: {
            Callout: "plugin-callout" as never,
          },
          scope: {
            greeting: "plugin",
          },
          allowImports: {
            demo: {
              Button: "plugin-button",
            },
          },
          resolveAssetUrl: (value) => `plugin:${value}`,
        },
      },
    )

    expect(merged.scope?.greeting).toBe("adapter")
    expect(merged.allowImports?.demo?.Button).toBe("adapter-button")
    expect(
      merged.resolveAssetUrl?.("hero.png", { owner: "acme", repo: "docs", branch: "main", filePath: "test.mdx" }),
    ).toBe("adapter:hero.png")
    expect(typeof merged.components?.Callout).toBe("function")
  })

  it("includes built-in native runtime shims even without a project adapter", () => {
    const merged = buildMergedContext(null, {})

    expect(merged.allowImports?.["next/link"]?.default).toBeDefined()
    expect(merged.allowImports?.["next/image"]?.default).toBeDefined()
    expect(merged.allowImports?.["fumadocs-ui/mdx"]?.defaultComponents).toBeDefined()
    expect(merged.allowImports?.["react/jsx-runtime"]?.jsx).toBeDefined()
  })
})
