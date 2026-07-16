import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
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
]

const noEffectFetchFiles = ["components/studio/hooks/use-studio-queries.ts"]

const optimisticSaveFiles = [
  "components/studio/hooks/use-studio-save.ts",
  "components/studio/hooks/use-studio-publish.ts",
]

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8")
}

const hostExecutionRoots = ["app", "components", "lib"]
const hostExecutionExtensions = new Set([".js", ".jsx", ".ts", ".tsx"])

const forbiddenExecutionIdentifiers = new Set([
  "Function",
  "eval",
  "evaluateMdx",
  "evaluateAdapter",
  "transpileAdapter",
  "RepoPressPreviewAdapter",
  "RenderBindings",
  "createRenderBindings",
  "componentsByContext",
])
const forbiddenExecutionModule = /(?:evaluateMdx|evaluate-adapter|esbuild-browser|execution-guard)(?:\.[jt]sx?)?$/

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

function listHostExecutionFiles(directory: string): string[] {
  const absoluteDirectory = path.join(ROOT, directory)
  if (!fs.existsSync(absoluteDirectory)) return []

  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (
        entry.name === "__tests__" ||
        entry.name === "node_modules" ||
        relativePath === path.join("components", "preview-sandbox")
      ) {
        return []
      }
      return listHostExecutionFiles(relativePath)
    }

    return entry.isFile() && hostExecutionExtensions.has(path.extname(entry.name)) ? [relativePath] : []
  })
}

function findHostExecutionViolations(): string[] {
  return hostExecutionRoots.flatMap(listHostExecutionFiles).flatMap((relativePath) => {
    const source = read(relativePath)
    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const violations: string[] = []
    const report = (node: ts.Node, label: string) => {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      violations.push(`${relativePath}:${position.line + 1}: ${label}`)
    }
    const moduleText = (node: ts.Expression | undefined) => (node && ts.isStringLiteralLike(node) ? node.text : null)
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && forbiddenExecutionIdentifiers.has(node.text)) {
        report(node, `forbidden execution identifier ${node.text}`)
      }
      if (
        (ts.isPropertyAccessExpression(node) && ["constructor", "Function"].includes(node.name.text)) ||
        (ts.isElementAccessExpression(node) &&
          ["constructor", "Function"].includes(moduleText(node.argumentExpression) ?? ""))
      ) {
        report(node, "dynamic constructor access")
      }
      if (
        (ts.isPropertyAccessExpression(node) && node.name.text === "eval") ||
        (ts.isElementAccessExpression(node) && moduleText(node.argumentExpression) === "eval")
      ) {
        report(node, "computed eval access")
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === "components" &&
        /adapter/i.test(node.expression.getText(sourceFile))
      ) {
        report(node, "executable adapter component-map access")
      }
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = node.moduleSpecifier && moduleText(node.moduleSpecifier)
        if (specifier && forbiddenExecutionModule.test(specifier))
          report(node, "host import of sandbox execution module")
      }
      if (ts.isCallExpression(node)) {
        const specifier = node.arguments.length === 1 ? moduleText(node.arguments[0]) : null
        if (
          specifier &&
          forbiddenExecutionModule.test(specifier) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === "require"))
        ) {
          report(node, "dynamic host import of sandbox execution module")
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return violations
  })
}

describe("review regression guards", () => {
  it("keeps repository and MDX execution out of the host realm", () => {
    expect(findHostExecutionViolations()).toEqual([])
    for (const relativePath of removedHostExecutionPaths) {
      expect(fs.existsSync(path.join(ROOT, relativePath)), relativePath).toBe(false)
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
