import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()

const clientFiles = [
  "components/studio/studio-context.tsx",
  "components/studio/file-tree-item.tsx",
  "components/studio/studio-header.tsx",
  "components/studio/studio-footer.tsx",
  "components/studio/hooks/use-studio-file.ts",
  "components/studio/hooks/use-studio-save.ts",
  "components/studio/hooks/use-studio-publish.ts",
]

const rawColorFiles = [
  "components/mdx-runtime/PreviewRuntime.tsx",
  "components/mdx-runtime/PreviewStatus.tsx",
  "components/settings/delete-project-zone.tsx",
  "components/repo-setup-form.tsx",
  "components/studio/studio-layout.tsx",
  "components/studio/component-insert-modal.tsx",
  "components/studio/image-field.tsx",
  "components/studio/repo-jsx-bridge.tsx",
  "lib/repopress/standard-library.tsx",
]

const noEffectFetchFiles = [
  "components/studio/hooks/use-studio-queries.ts",
  "lib/hooks/use-adapter.ts",
  "lib/hooks/use-preview-context.ts",
]

const optimisticSaveFiles = [
  "components/studio/hooks/use-studio-save.ts",
  "components/studio/hooks/use-studio-publish.ts",
]

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8")
}

describe("review regression guards", () => {
  it("keeps the required studio modules as explicit client files", () => {
    for (const relativePath of clientFiles) {
      expect(read(relativePath).startsWith('"use client"')).toBe(true)
    }
  })

  it("removes raw Tailwind status colors from the reviewed UI files", () => {
    const rawColorPattern =
      /\b(?:bg|text|border)-(?:blue|green|red|amber|yellow|slate|gray|zinc|stone|emerald|rose|orange)(?:-\d{2,3}|\/\d+)?\b/

    for (const relativePath of rawColorFiles) {
      expect(read(relativePath)).not.toMatch(rawColorPattern)
    }
  })

  it("does not use useEffect for the reviewed data-loading hooks", () => {
    for (const relativePath of noEffectFetchFiles) {
      const source = read(relativePath)
      expect(source).not.toContain("useEffect(")
      expect(source).not.toContain("React.useEffect(")
    }
  })

  it("threads optimistic-lock tokens through the reviewed save paths", () => {
    for (const relativePath of optimisticSaveFiles) {
      expect(read(relativePath)).toContain("expectedUpdatedAt")
    }
  })

  it("does not ship the unprotected MDX debug pages", () => {
    expect(fs.existsSync(path.join(ROOT, "app/test-mdx/page.tsx"))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, "app/test-sync/page.tsx"))).toBe(false)
  })

  it("documents the Next.js 16 proxy convention in CLAUDE.md", () => {
    const claude = read("CLAUDE.md")
    expect(claude).toContain("proxy.ts")
    expect(claude).not.toContain("middleware.ts")
  })

  it("cleans up the image upload progress timer on failures", () => {
    const source = read("components/studio/image-upload-zone.tsx")
    expect(source).toMatch(/finally\s*{[\s\S]*?clearInterval\(/)
  })

  it("normalizes external image URLs before saving", () => {
    const source = read("components/studio/image-field.tsx")
    expect(source).toMatch(/normalizeExternalImageUrl/)
    expect(source).toMatch(/onSelect\(\s*normalizeExternalImageUrl\(/)
  })

  it("keeps studio component previews self-hosted", () => {
    const source = read("components/studio/component-preview.tsx")
    expect(source).not.toContain("grainy-gradients.vercel.app")
    expect(source).not.toContain("http://")
    expect(source).not.toContain("https://")
  })

  it("does not pin platform-specific Next.js binaries in package.json", () => {
    const manifest = JSON.parse(read("package.json")) as {
      devDependencies?: Record<string, string>
    }

    expect(manifest.devDependencies?.["@next/swc-darwin-arm64"]).toBeUndefined()
  })
})
