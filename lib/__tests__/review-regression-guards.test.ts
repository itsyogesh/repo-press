import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import {
  findHostExecutionViolations,
  findHostExecutionViolationsInSource,
  listHostProductionFiles,
} from "../host-execution-guard"

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
]

const noEffectFetchFiles = ["components/studio/hooks/use-studio-queries.ts"]

const optimisticSaveFiles = [
  "components/studio/hooks/use-studio-save.ts",
  "components/studio/hooks/use-studio-publish.ts",
]

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8")
}

const removedHostExecutionPaths = [
  "app/dashboard/[owner]/[repo]/adapter-actions.ts",
  "app/dashboard/[owner]/[repo]/plugin-actions.ts",
  "app/dashboard/[owner]/[repo]/mdx-actions.ts",
  "components/mdx-runtime/adapter.tsx",
  "components/mdx-runtime/evaluateMdx.ts",
  "components/studio/repo-jsx-bridge.tsx",
  "lib/hooks/use-adapter.ts",
  "lib/hooks/use-preview-context.ts",
  "lib/repopress/adapter-cache.ts",
  "lib/repopress/adapter.ts",
  "lib/repopress/esbuild-browser.ts",
  "lib/repopress/evaluate-adapter.ts",
  "lib/repopress/function-constructor-guard.ts",
  "lib/repopress/preview-context.ts",
  "lib/repopress/repo-module-bundle.ts",
  "lib/preview/render-bindings.ts",
]

function listSandboxSourceFiles(directory: string): string[] {
  const absoluteDirectory = path.join(ROOT, directory)
  if (!fs.existsSync(absoluteDirectory)) return []

  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") return []
      return listSandboxSourceFiles(relativePath)
    }

    return entry.isFile() &&
      new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"]).has(path.extname(entry.name))
      ? [relativePath]
      : []
  })
}

function findNavigableSandboxExecutionViolations(): string[] {
  const allowedWorkerSource = path.join("components", "preview-sandbox", "compatible-worker.ts")
  return listSandboxSourceFiles(path.join("components", "preview-sandbox")).flatMap((relativePath) => {
    if (relativePath === allowedWorkerSource) return []
    const sourceFile = ts.createSourceFile(
      relativePath,
      read(relativePath),
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const violations: string[] = []
    const visit = (node: ts.Node) => {
      if (
        (ts.isIdentifier(node) && ["Function", "eval", "evaluateAdapter", "evaluateMdx"].includes(node.text)) ||
        ((ts.isNewExpression(node) || ts.isCallExpression(node)) &&
          ts.isIdentifier(node.expression) &&
          ["Function", "eval"].includes(node.expression.text))
      ) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        violations.push(`${relativePath}:${position.line + 1}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return violations
  })
}

describe("review regression guards", () => {
  it("detects computed and aliased host execution primitives", () => {
    const violations = findHostExecutionViolationsInSource(
      "app/adversarial.ts",
      `
        const host = globalThis
        const functionName = "Fun" + "ction"
        const compile = host[functionName]
        compile("return 1")()

        const directCompile = Function
        directCompile("return 3")()

        const indirectEval = (0, eval)
        indirectEval("globalThis.compromised = true")

        const constructorName = "con" + "structor"
        const nestedCompile = []["filter"][constructorName]
        nestedCompile("return 2")()

        const loader = require
        const guardedModule = "@/components/preview-sandbox/" + "execution-guard"
        loader(guardedModule)

        const importedModule = "./evaluate-" + "adapter"
        import(importedModule)

        const importLater = (specifier) => import(specifier)
        importLater(guardedModule)
      `,
    )

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("dynamic Function execution"),
        expect.stringContaining("indirect eval execution"),
        expect.stringContaining("dynamic constructor access"),
        expect.stringContaining("dynamic host import of sandbox execution module"),
      ]),
    )
  })

  it("scans every production source surface while excluding non-production code and the sandbox", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repopress-host-scan-"))
    const productionFiles = [
      "app/page.tsx",
      "app/runtime.mts",
      "components/card.jsx",
      "convex/runtime.cts",
      "hooks/runtime.cts",
      "lib/runtime.ts",
      "lib/runtime.mts",
      "lib/config/runtime.ts",
      "lib/runtime.config.ts",
      "hooks/use-runtime.js",
      "convex/runtime.cjs",
      "proxy.ts",
      "instrumentation.mjs",
      "next.config.mjs",
      "root.setup.ts",
      "root-component.tsx",
      "root-module.mts",
      "root-runtime.js",
      "root-widget.jsx",
      "root-worker.cjs",
      "root-worker.cts",
    ]
    const excludedFiles = [
      "app/__tests__/page.test.tsx",
      "lib/runtime.spec.ts",
      "lib/types.d.mts",
      "lib/types.d.cts",
      "convex/_generated/api.js",
      "components/preview-sandbox/compatible-worker.ts",
      ".next/server/app.js",
      "dist/runtime.js",
    ]

    try {
      for (const relativePath of [...productionFiles, ...excludedFiles]) {
        const absolutePath = path.join(fixtureRoot, relativePath)
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
        fs.writeFileSync(
          absolutePath,
          relativePath === "next.config.mjs"
            ? `export default { headers: "script-src 'self' 'unsafe-eval'" }\n`
            : "export const value = 1\n",
        )
      }

      const discovered = listHostProductionFiles(fixtureRoot).sort()
      expect(discovered).toEqual([...productionFiles].sort())
      expect(findHostExecutionViolations(fixtureRoot)).toEqual([])
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  it("detects destructured, computed, assigned, and aliased executable adapter component maps", () => {
    const violations = findHostExecutionViolationsInSource(
      "lib/adapter-map-probe.ts",
      `
        const adapterAlias = repositoryAdapter
        const componentKey = "compo" + "nents"
        const contextKey = "components" + "ByContext"
        const bindingsKey = "Render" + "Bindings"
        const { components: directMap } = adapterAlias
        const { [componentKey]: computedMap } = adapterAlias
        const { [contextKey]: contextualMap, [bindingsKey]: bindingsMap } = adapterAlias
        let assignedMap
        ;({ [componentKey]: assignedMap } = adapterAlias)
        const renamedMap = assignedMap
        renamedMap.Hero({})
        computedMap["Callout"]({})
        directMap({})
        contextualMap.docs.Hero({})
        bindingsMap["Callout"]({})
      `,
    )

    expect(violations).toEqual(expect.arrayContaining([expect.stringContaining("executable adapter component-map")]))
  })

  it("does not taint generated Convex component imports or ordinary adapter config metadata", () => {
    expect(
      findHostExecutionViolationsInSource(
        "convex/convex.config.ts",
        `
          import { components } from "./_generated/api"
          const adapterConfig = { components: ["metadata-only"] }
          const metadataComponents = adapterConfig.components
          export default { components, metadataComponents }
        `,
      ),
    ).toEqual([])
  })

  it("keeps repository and MDX execution out of the host realm", () => {
    expect(findHostExecutionViolations()).toEqual([])
    for (const relativePath of removedHostExecutionPaths) {
      expect(fs.existsSync(path.join(ROOT, relativePath)), relativePath).toBe(false)
    }
  })

  it("keeps repository execution out of the navigable sandbox Window", () => {
    const runtime = read("components/preview-sandbox/SandboxRuntime.tsx")
    for (const forbidden of [
      "evaluateCompatibleArtifact",
      "evaluateMdx",
      "evaluateAdapter",
      "RepoPressPreviewAdapter",
      "<RenderedArtifact",
    ]) {
      expect(runtime, forbidden).not.toContain(forbidden)
    }
    expect(runtime).toContain("createCompatibleWorkerRenderer")
    expect(runtime).toContain("CompatibleRenderTreeView")
    expect(read("components/preview-sandbox/compatible-worker.ts")).toContain("sanitizeCompatibleRenderTree")
    expect(findNavigableSandboxExecutionViolations()).toEqual([])
    for (const removed of [
      "components/preview-sandbox/evaluate-adapter.ts",
      "components/preview-sandbox/evaluateMdx.ts",
      "components/preview-sandbox/execution-guard.ts",
    ]) {
      expect(fs.existsSync(path.join(ROOT, removed)), removed).toBe(false)
    }
  })

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

  it("routes external image URLs through staged media downloads", () => {
    const imageFieldSource = read("components/studio/image-field.tsx")
    const imageFieldControlSource = read("components/studio/image-field-control.tsx")
    expect(imageFieldSource).toMatch(/downloadExternalImage/)
    expect(imageFieldControlSource).toMatch(/downloadExternalImage/)
    expect(imageFieldSource).not.toMatch(/onSelect\(\s*normalizeExternalImageUrl\(/)
    expect(imageFieldControlSource).not.toMatch(/onSelect\(\s*normalizeExternalImageUrl\(/)
  })

  it("uses document-aware upload folders for editor image uploads", () => {
    const source = read("components/studio/editor.tsx")
    expect(source).toContain("getSuggestedImagePath(filePath,")
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
