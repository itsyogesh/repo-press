import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { compileMdx } from "@/components/preview-sandbox/compileMdx"
import { normalizeRegistryAuthoringMetadata, registryItemSchema } from "@/lib/repopress/registry-schema"
import { buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"

const ROOT = process.cwd()
const REGISTRY_PATH = "registry.json"
const SOURCE_PATH = "registry/repopress/callout/callout.tsx"
const FIXTURE_PATH = "registry/repopress/callout/fixture.mdx"
const INSTALL_TARGET = "components/repopress/callout.tsx"
const IMPORT_SOURCE = "@/components/repopress/callout"

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

function uint32Frame(byteLength: number): Buffer {
  const frame = Buffer.alloc(4)
  frame.writeUInt32BE(byteLength)
  return frame
}

/**
 * Canonical integrity input for registry fixtures: sort by code-unit path,
 * then hash uint32(path byte length) + path bytes + uint32(content byte length)
 * + exact content bytes for each file. Length framing prevents ambiguity.
 */
function fixtureIntegrity(files: Readonly<Record<string, string>>): string {
  const hash = createHash("sha256")
  for (const relativePath of Object.keys(files).sort()) {
    const pathBytes = Buffer.from(relativePath, "utf8")
    const contentBytes = Buffer.from(files[relativePath], "utf8")
    hash.update(uint32Frame(pathBytes.byteLength))
    hash.update(pathBytes)
    hash.update(uint32Frame(contentBytes.byteLength))
    hash.update(contentBytes)
  }
  return `sha256-${hash.digest("base64")}`
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
      import: { source: IMPORT_SOURCE, exportName: "Callout" },
      frameworks: ["fumadocs", "next"],
      runtime: "client",
      schemaStatus: "complete",
      props: [
        { name: "title", type: "string", label: "Title", required: false },
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
  })

  it("binds source, fixture, install target, export, variants, and canonical integrity", () => {
    const [rawItem] = readRegistry().items
    const item = registryItemSchema.parse(rawItem)
    const metadata = item.meta.repopress
    const source = read(SOURCE_PATH)
    const fixture = read(FIXTURE_PATH)
    const inputs = { [SOURCE_PATH]: source, [FIXTURE_PATH]: fixture }
    const integrity = fixtureIntegrity(inputs)

    expect(item.files).toEqual([{ path: SOURCE_PATH, target: INSTALL_TARGET, type: "registry:component" }])
    expect(metadata.preview).toEqual({ fixtures: [FIXTURE_PATH], defaultFixture: FIXTURE_PATH })
    expect(metadata.authoring.import).toEqual({ source: IMPORT_SOURCE, exportName: metadata.exportName })
    expect(INSTALL_TARGET.replace(/^components\//u, "@/components/").replace(/\.tsx$/u, "")).toBe(IMPORT_SOURCE)
    for (const declaredPath of [...(item.files?.map((file) => file.path) ?? []), ...metadata.preview.fixtures]) {
      expect(fs.existsSync(path.join(ROOT, declaredPath)), declaredPath).toBe(true)
    }
    expect(metadata.authoring.provenance?.integrity).toBe(integrity)
    expect(integrity).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/u)
    expect(fixtureIntegrity({ ...inputs, [SOURCE_PATH]: `${source}\n` })).not.toBe(integrity)
    expect(fixtureIntegrity({ ...inputs, [FIXTURE_PATH]: `${fixture}\n` })).not.toBe(integrity)
    expect(exportedNames(source)).toContain(metadata.exportName)
    expect(source).toContain('variant?: "default" | "accent"')
    expect(metadata.authoring.props?.find((prop) => prop.name === "variant")?.options).toEqual(["default", "accent"])
  })

  it("keeps the implementation browser-safe, semantic, and token-based", () => {
    const source = read(SOURCE_PATH)
    expect(source).toContain("<aside")
    expect(source).toContain("{...asideProps}")
    expect(source.indexOf("{...asideProps}")).toBeLessThan(source.indexOf("className="))
    expect(source).not.toMatch(/(?:bg|text|border)-(?:white|black|gray|slate|red|amber|blue)-/u)
    expect(source).not.toMatch(/dangerouslySetInnerHTML|\buse[A-Z]\w*\s*\(|\bfetch\s*\(|\bWebSocket\b|createPortal/u)
    expect(source).not.toMatch(/from\s+["']@\//u)
  })

  it("compiles the real MDX fixture against the declared import without evaluating it", async () => {
    const [rawItem] = readRegistry().items
    const item = registryItemSchema.parse(rawItem)
    const importDeclaration = item.meta.repopress.authoring.import
    expect(importDeclaration).toBeDefined()

    const result = await compileMdx(read(FIXTURE_PATH), {
      [importDeclaration?.source ?? ""]: [importDeclaration?.exportName ?? ""],
    })

    expect(result.error).toBeUndefined()
    expect(result.code).toBeDefined()
    expect(result.imports).toEqual([{ source: IMPORT_SOURCE, imported: "Callout", local: "Callout" }])
    expect(read(FIXTURE_PATH)).toContain('variant="accent"')
    expect(read(FIXTURE_PATH)).toContain("**")
  })
})
