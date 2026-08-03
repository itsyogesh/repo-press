import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { compileMdx } from "@/components/preview-sandbox/compileMdx"
import { computeRegistryItemIntegrity } from "@/lib/repopress/registry-integrity"
import { normalizeRegistryAuthoringMetadata, registryItemSchema } from "@/lib/repopress/registry-schema"
import { buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"

const ROOT = process.cwd()
const REGISTRY_PATH = "registry.json"
const SOURCE_PATH = "registry/repopress/callout/callout.tsx"
const FIXTURE_PATH = "registry/repopress/callout/fixture.mdx"
const INSTALL_TARGET = "@components/repopress/callout.tsx"

type RegistryRoot = {
  $schema: string
  name: string
  homepage: string
  items: unknown[]
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8")
}

function readRegistry(): RegistryRoot {
  return JSON.parse(read(REGISTRY_PATH)) as RegistryRoot
}

function resolveComponentsTarget(target: string, componentsDirectory: string): string {
  if (!target.startsWith("@components/")) throw new TypeError("Expected the portable @components target placeholder")
  return `${componentsDirectory}/${target.slice("@components/".length)}`
}

function exportedNames(source: string): Set<string> {
  const sourceFile = ts.createSourceFile(SOURCE_PATH, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    const isExported =
      (ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined)?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ) ?? false
    if (!isExported) continue
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      names.add(statement.name.text)
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
      }
    }
  }

  return names
}

describe("official Callout registry item", () => {
  it("uses the current shadcn root registry shape with one RepoPress item", () => {
    expect(fs.existsSync(path.join(ROOT, REGISTRY_PATH))).toBe(true)

    const registry = readRegistry()
    expect(registry).toMatchObject({
      $schema: "https://ui.shadcn.com/schema/registry.json",
      name: "repopress",
      homepage: "https://repopress.dev",
    })
    expect(Object.keys(registry)).toEqual(["$schema", "name", "homepage", "items"])
    expect(registry.items).toHaveLength(1)
  })

  it("normalizes one complete immutable authoring contract", () => {
    const [rawItem] = readRegistry().items
    const item = registryItemSchema.parse(rawItem)
    const normalized = normalizeRegistryAuthoringMetadata(item)
    const catalog = buildAuthoringCatalog({ metadata: { Callout: normalized } })

    expect(item).toMatchObject({
      $schema: "https://ui.shadcn.com/schema/registry-item.json",
      name: "callout",
      title: "Callout",
      type: "registry:component",
      dependencies: ["react"],
      files: [{ path: SOURCE_PATH, target: INSTALL_TARGET, type: "registry:component" }],
    })
    expect(catalog).toHaveLength(1)
    expect(catalog[0]).toStrictEqual(normalized)
    expect(catalog[0]).toMatchObject({
      logicalId: "@repopress/callout",
      mdxName: "Callout",
      displayName: "Callout",
      version: "1.0.0",
      exportName: "Callout",
      frameworks: ["fumadocs", "next"],
      runtime: "client",
      schemaStatus: "complete",
      props: [
        { name: "title", type: "string", label: "Title", required: false },
        { name: "titleId", type: "string", label: "Title ID", required: false },
        {
          name: "variant",
          type: "string",
          label: "Variant",
          required: true,
          options: ["default", "accent"],
          default: "default",
        },
      ],
      slots: [{ name: "children", accepts: "mdx", required: true }],
      previewFixtures: [FIXTURE_PATH],
      defaultFixture: FIXTURE_PATH,
      provenance: {
        source: "registry",
        registryItem: "@repopress/callout",
        version: "1.0.0",
      },
    })
    expect(Object.isFrozen(catalog)).toBe(true)
    expect(Object.isFrozen(catalog[0])).toBe(true)
    expect(Object.isFrozen(catalog[0].props)).toBe(true)
    expect(Object.isFrozen(catalog[0].slots)).toBe(true)
    expect(catalog[0].provenance.integrity).toBe(item.meta.repopress.authoring.provenance?.integrity)
    expect(catalog[0].import).toBeUndefined()
  })

  it("binds source, fixture, install target, export, variants, and canonical integrity", () => {
    const [rawItem] = readRegistry().items
    const item = registryItemSchema.parse(rawItem)
    const metadata = item.meta.repopress
    const source = read(SOURCE_PATH)
    const fixture = read(FIXTURE_PATH)
    const integrity = computeRegistryItemIntegrity({
      item,
      files: [
        { path: SOURCE_PATH, content: source },
        { path: FIXTURE_PATH, content: fixture },
      ],
    })

    expect(item.files).toEqual([{ path: SOURCE_PATH, target: INSTALL_TARGET, type: "registry:component" }])
    expect(metadata.preview).toEqual({ fixtures: [FIXTURE_PATH], defaultFixture: FIXTURE_PATH })
    expect(metadata.authoring.import).toBeUndefined()
    for (const declaredPath of [...(item.files?.map((file) => file.path) ?? []), ...metadata.preview.fixtures]) {
      expect(fs.existsSync(path.join(ROOT, declaredPath)), declaredPath).toBe(true)
    }
    expect(metadata.authoring.provenance?.integrity).toBe(integrity)
    expect(integrity).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/u)
    expect(exportedNames(source)).toContain(metadata.exportName)
    expect(source).toContain('variant?: "default" | "accent"')
    expect(metadata.authoring.props?.find((prop) => prop.name === "variant")?.options).toEqual(["default", "accent"])
  })

  it.each([
    ["root components alias", "components"],
    ["src components alias", "src/components"],
    ["package-import or non-@ alias", "packages/docs/ui"],
  ])("leaves project layout resolution to the portable target placeholder: %s", (_, componentsDirectory) => {
    expect(resolveComponentsTarget(INSTALL_TARGET, componentsDirectory)).toBe(
      `${componentsDirectory}/repopress/callout.tsx`,
    )
  })

  it("keeps the implementation browser-safe, semantic, and token-based", () => {
    const source = read(SOURCE_PATH)
    const hooks = [...source.matchAll(/\b(use[A-Z]\w*)\s*\(/gu)].map((match) => match[1])
    expect(source.startsWith('"use client"')).toBe(true)
    expect(source).toContain("<aside")
    expect(source).toContain("{...asideProps}")
    expect(source.indexOf("{...asideProps}")).toBeLessThan(source.indexOf("className="))
    expect(source).toContain("titleId?: string")
    expect(source).toContain("const generatedTitleId = useId()")
    expect(source).toContain("const resolvedTitleId = title ? (titleId ?? generatedTitleId) : undefined")
    expect(source).toContain("aria-labelledby={resolvedTitleId ?? ariaLabelledby}")
    expect(source).toContain("id={resolvedTitleId}")
    expect(hooks).toEqual(["useId"])
    expect(source).not.toMatch(/(?:bg|text|border)-(?:white|black|gray|slate|red|amber|blue)-/u)
    expect(source).not.toMatch(/dangerouslySetInnerHTML|\bfetch\s*\(|\bWebSocket\b|createPortal/u)
    expect(source).not.toMatch(/from\s+["']@\//u)
  })

  it("compiles the import-free MDX fixture without evaluating it or assuming a project alias", async () => {
    const result = await compileMdx(read(FIXTURE_PATH), {})

    expect(result.error).toBeUndefined()
    expect(result.code).toBeDefined()
    expect(result.imports).toEqual([])
    expect(read(FIXTURE_PATH)).not.toMatch(/^import\s/mu)
    expect(read(FIXTURE_PATH)).toContain('variant="accent"')
    expect(read(FIXTURE_PATH)).toContain('titleId="migration-note-callout-title"')
    expect(read(FIXTURE_PATH)).toContain("**")
  })
})
