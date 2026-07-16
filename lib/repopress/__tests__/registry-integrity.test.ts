import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { computeRegistryItemIntegrity, type RegistryIntegrityFile } from "../registry-integrity"

const ROOT = process.cwd()
const SOURCE_PATH = "registry/repopress/callout/callout.tsx"
const FIXTURE_PATH = "registry/repopress/callout/fixture.mdx"

type MutableItem = Record<string, any>

function registryItem(): MutableItem {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "registry.json"), "utf8")) as { items: MutableItem[] }
  return registry.items[0]
}

function referencedFiles(): RegistryIntegrityFile[] {
  return [SOURCE_PATH, FIXTURE_PATH].map((relativePath) => ({
    path: relativePath,
    content: fs.readFileSync(path.join(ROOT, relativePath), "utf8"),
  }))
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function digestWith(
  mutateItem: (item: MutableItem) => void = () => {},
  mutateFiles: (files: RegistryIntegrityFile[]) => void = () => {},
): string {
  const item = clone(registryItem())
  const files = referencedFiles()
  mutateItem(item)
  mutateFiles(files)
  return computeRegistryItemIntegrity({ item, files })
}

describe("computeRegistryItemIntegrity", () => {
  it("matches the Callout SRI and excludes only the integrity field itself", () => {
    const item = registryItem()
    const expected = item.meta.repopress.authoring.provenance.integrity
    expect(digestWith()).toBe(expected)

    expect(
      digestWith((candidate) => {
        candidate.meta.repopress.authoring.provenance.integrity = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
      }),
    ).toBe(expected)
  })

  it.each([
    ["target", (item: MutableItem) => (item.files[0].target = "@components/other/callout.tsx")],
    ["file type", (item: MutableItem) => (item.files[0].type = "registry:ui")],
    ["package dependency", (item: MutableItem) => item.dependencies.push("class-variance-authority@0.7.1")],
    ["registry dependency", (item: MutableItem) => item.registryDependencies.push("button")],
    [
      "export metadata",
      (item: MutableItem) => {
        item.meta.repopress.exportName = "Notice"
        item.meta.repopress.authoring.exportName = "Notice"
        if (item.meta.repopress.authoring.import) item.meta.repopress.authoring.import.exportName = "Notice"
      },
    ],
    [
      "framework metadata",
      (item: MutableItem) => {
        item.meta.repopress.frameworks = ["next"]
        item.meta.repopress.authoring.frameworks = ["next"]
      },
    ],
    ["authoring metadata", (item: MutableItem) => (item.meta.repopress.authoring.props[0].label = "Heading")],
    ["CSS manifest", (item: MutableItem) => (item.css = { "@layer components": { callout: true } })],
  ])("changes when install-relevant %s changes", (_, mutate) => {
    expect(digestWith(mutate)).not.toBe(digestWith())
  })

  it.each([
    [SOURCE_PATH, 0],
    [FIXTURE_PATH, 1],
  ])("changes when referenced bytes change: %s", (_, index) => {
    expect(
      digestWith(undefined, (files) => {
        files[index] = { ...files[index], content: `${files[index].content}\n` }
      }),
    ).not.toBe(digestWith())
  })

  it("canonicalizes object key order while preserving ordered manifest arrays", () => {
    const item = registryItem()
    const reversed = Object.fromEntries(Object.entries(item).reverse())
    expect(computeRegistryItemIntegrity({ item: reversed, files: referencedFiles() })).toBe(digestWith())

    const ordered = clone(item)
    ordered.dependencies = ["alpha", "beta"]
    const reversedOrder = clone(item)
    reversedOrder.dependencies = ["beta", "alpha"]
    expect(computeRegistryItemIntegrity({ item: ordered, files: referencedFiles() })).not.toBe(
      computeRegistryItemIntegrity({ item: reversedOrder, files: referencedFiles() }),
    )
  })

  it("fails closed on missing, duplicate, extra, and unsupported inputs", () => {
    expect(() => computeRegistryItemIntegrity({ item: registryItem(), files: referencedFiles().slice(0, 1) })).toThrow(
      "Missing referenced bytes",
    )
    expect(() =>
      computeRegistryItemIntegrity({ item: registryItem(), files: [...referencedFiles(), referencedFiles()[0]] }),
    ).toThrow("Duplicate referenced bytes")
    expect(() =>
      computeRegistryItemIntegrity({
        item: registryItem(),
        files: [...referencedFiles(), { path: "registry/repopress/callout/extra.ts", content: "extra" }],
      }),
    ).toThrow("Unexpected referenced bytes")

    const cyclic = registryItem()
    cyclic.meta.vendor = cyclic
    expect(() => computeRegistryItemIntegrity({ item: cyclic, files: referencedFiles() })).toThrow("cycle")
  })
})
