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
      "app/test/runtime.ts",
      "app/runtime.mts",
      "components/card.jsx",
      "components/generated/runtime.ts",
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
      "remotion/runtime.tsx",
      "packages/future/runtime.cts",
    ]
    const excludedFiles = [
      "app/__tests__/page.test.tsx",
      "lib/runtime.spec.ts",
      "lib/types.d.mts",
      "lib/types.d.cts",
      "convex/_generated/api.js",
      "node_modules/dependency/runtime.js",
      ".git/worktrees/linked/runtime.ts",
      ".agents/cache/runtime.ts",
      ".claude/cache/runtime.ts",
      ".codex/cache/runtime.ts",
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
        const adapterSource = usePreviewContext().adapter
        const adapterAlias = adapterSource
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

  it("detects semantic adapter values returned by host context APIs", () => {
    const violations = findHostExecutionViolationsInSource(
      "components/studio/adapter-context-probe.tsx",
      `
        const { adapter: runtime } = usePreviewContext()
        const directRuntime = usePreviewContext().adapter
        const componentMap = runtime.components
        const aliasedMap = componentMap
        aliasedMap.Hero({})
        directRuntime["componentsByContext"].docs.Callout({})
      `,
    )

    expect(violations).toEqual(expect.arrayContaining([expect.stringContaining("executable adapter component-map")]))
  })

  it("forbids every runtime import path into the preview sandbox outside its route entry", () => {
    const staticViolations = findHostExecutionViolationsInSource(
      "components/studio/host-probe.tsx",
      `
        import { createCompatibleWorkerRenderer } from "@/components/preview-sandbox/compatible-worker"
        export { SandboxRuntime } from "@/components/preview-sandbox/SandboxRuntime"
        createCompatibleWorkerRenderer()
      `,
    )
    const dynamicViolations = findHostExecutionViolationsInSource(
      "lib/host-probe.ts",
      `
        const sandboxModule = "@/components/preview-" + "sandbox/compatible-diagnostics"
        import(sandboxModule)
        require("@/components/preview-sandbox/compatible-render-tree")
      `,
    )

    expect(staticViolations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("host import of preview sandbox module"),
        expect.stringContaining("forbidden execution identifier createCompatibleWorkerRenderer"),
      ]),
    )
    expect(dynamicViolations).toEqual(
      expect.arrayContaining([expect.stringContaining("dynamic host import of preview sandbox module")]),
    )
  })

  it("detects import-equals and every CommonJS require route into the preview sandbox", () => {
    const importEqualsViolations = findHostExecutionViolationsInSource(
      "lib/import-equals-probe.cts",
      `import worker = require("@/components/preview-sandbox/compatible-worker")`,
    )
    const commonJsViolations = findHostExecutionViolationsInSource(
      "lib/commonjs-probe.cjs",
      `
        const target = "@/components/preview-" + "sandbox/compatible-render-tree"
        require(target)
        const globalLoad = globalThis.require
        globalLoad(target)
        module.require(target)
        const moduleLoad = module.require
        moduleLoad(target)
        const { require: destructuredLoad } = module
        destructuredLoad(target)
        const boundLoad = module.require.bind(module)
        boundLoad(target)
      `,
    )
    const violations = [...importEqualsViolations, ...commonJsViolations].filter((violation) =>
      violation.includes("preview sandbox module"),
    )

    expect(violations).toHaveLength(7)
  })

  it("does not treat ordinary local require or load functions as CommonJS loaders", () => {
    expect(
      findHostExecutionViolationsInSource(
        "lib/local-loader-probe.cjs",
        `
          function require(specifier) { return specifier }
          function load(specifier) { return specifier }
          const target = "@/components/preview-" + "sandbox/compatible-worker"
          require(target)
          load(target)
        `,
      ),
    ).toEqual([])
  })

  it("categorically forbids runtime imports of repository preview adapter modules", () => {
    const staticViolations = findHostExecutionViolationsInSource(
      "components/studio/repository-adapter-probe.tsx",
      `
        import adapterDefault from "@/.repopress/mdx-preview"
        import { adapter as runtimeAdapter } from "@/.repopress/mdx-preview"
        import { adapter } from "@/.repopress/mdx-preview"
        export { adapterDefault, runtimeAdapter, adapter }
      `,
    )
    const dynamicViolations = findHostExecutionViolationsInSource(
      "lib/repository-adapter-probe.cjs",
      `
        const target = "@/.repopress/" + "mdx-preview"
        require(target)
        import(target)
      `,
    )

    expect(
      staticViolations.filter((violation) => violation.includes("repository preview adapter module")),
    ).toHaveLength(3)
    expect(
      dynamicViolations.filter((violation) => violation.includes("repository preview adapter module")),
    ).toHaveLength(2)
  })

  it("taints default, renamed, and direct repository adapter imports through assignment aliases", () => {
    const violations = findHostExecutionViolationsInSource(
      "components/studio/repository-adapter-bindings-probe.tsx",
      `
        import adapterDefault from "@/.repopress/mdx-preview"
        import { adapter as runtimeAdapter } from "@/.repopress/mdx-preview"
        import { adapter } from "@/.repopress/mdx-preview"
        const adapterAlias = adapter
        adapter.components.Hero({})
        runtimeAdapter["componentsByContext"].docs.Callout({})
        adapterDefault.RenderBindings.Callout({})
        adapterAlias.components.Hero({})
      `,
    )

    expect(violations.filter((violation) => violation.includes("executable adapter component-map"))).not.toHaveLength(0)
  })

  it("allows only inert type imports from the repository preview adapter schema", () => {
    expect(
      findHostExecutionViolationsInSource(
        "lib/repository-adapter-schema-probe.ts",
        `import type { MdxPreviewSchema } from "@/.repopress/mdx-preview/schema"`,
      ),
    ).toEqual([])
  })

  it("allows only the inert type edge and the exact sandbox route runtime entry", () => {
    expect(
      findHostExecutionViolationsInSource(
        "lib/type-probe.ts",
        `import type { CompatibleRenderTree } from "@/components/preview-sandbox/compatible-render-tree"`,
      ),
    ).toEqual([])
    expect(
      findHostExecutionViolationsInSource(
        "app/preview/sandbox/page.tsx",
        `import { SandboxRuntime } from "@/components/preview-sandbox/SandboxRuntime"`,
      ),
    ).toEqual([])
    expect(
      findHostExecutionViolationsInSource(
        "app/preview/sandbox/page.tsx",
        `export { SandboxRuntime } from "@/components/preview-sandbox/SandboxRuntime"`,
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining("host import of preview sandbox module")]))
  })

  it("does not taint generated Convex component imports or ordinary adapter config metadata", () => {
    expect(
      findHostExecutionViolationsInSource(
        "convex/convex.config.ts",
        `
          import { components } from "./_generated/api"
          const adapterConfig = { components: ["metadata-only"] }
          const metadataComponents = adapterConfig.components
          const metadataAdapter = { components: ["also-metadata-only"] }
          const metadataAdapterComponents = metadataAdapter.components
          export default { components, metadataComponents, metadataAdapterComponents }
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
