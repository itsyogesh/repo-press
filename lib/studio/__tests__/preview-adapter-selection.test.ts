import { describe, expect, it } from "vitest"
import { resolvePreviewAdapterPath, resolvePreviewAdapterRoot } from "../preview-adapter-selection"

describe("preview adapter selection", () => {
  it("uses resolved runtime adapter path when available", () => {
    const path = resolvePreviewAdapterPath(
      {
        entryPath: "apps/docs/mdx-components.tsx",
        rootPath: "apps/docs",
      },
      ".repopress/mdx-preview.tsx",
    )
    const root = resolvePreviewAdapterRoot({
      entryPath: "apps/docs/mdx-components.tsx",
      rootPath: "apps/docs",
    })

    expect(path).toBe("apps/docs/mdx-components.tsx")
    expect(root).toBe("apps/docs")
  })

  it("does not fall back to legacy previewEntry when runtime resolves to generic", () => {
    const path = resolvePreviewAdapterPath(
      {
        entryPath: null,
        rootPath: null,
      },
      ".repopress/mdx-preview.tsx",
    )

    expect(path).toBeNull()
  })

  it("falls back to previewEntry when resolved runtime is unavailable", () => {
    const path = resolvePreviewAdapterPath(undefined, ".repopress/mdx-preview.tsx")
    const root = resolvePreviewAdapterRoot(undefined)

    expect(path).toBe(".repopress/mdx-preview.tsx")
    expect(root).toBeNull()
  })
})
