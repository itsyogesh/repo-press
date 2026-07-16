import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { dryRunInstallPlan, type ProjectInstallLayout, planRegistryInstall } from "../install-plan"
import { computeRegistryItemIntegrity } from "../registry-integrity"
import { type RegistrySourceInput, resolveRegistryItems } from "../registry-resolver"

const REF = "0123456789abcdef0123456789abcdef01234567"
const runtimeSource =
  'import type { MDXComponents } from "mdx/types"\nexport function useMDXComponents(components: MDXComponents): MDXComponents {\n  return { ...components }\n}\n'

function sha(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`
}

function registrySource(options: {
  id: string
  ref?: string
  deps?: string[]
  target?: string
  content?: string
  packages?: string[]
  cssVars?: unknown
  css?: unknown
  envVars?: Record<string, string>
}): RegistrySourceInput {
  const name = options.id.split("/").at(-1) ?? options.id
  const mdxName = name[0].toUpperCase() + name.slice(1)
  const path = `registry/${name}.tsx`
  const content = options.content ?? `export function ${mdxName}() { return null }\n`
  const item: Record<string, any> = {
    name,
    type: "registry:component",
    dependencies: options.packages ?? [],
    registryDependencies: options.deps ?? [],
    files: [{ path, type: "registry:component", target: options.target ?? `@components/repopress/${name}.tsx` }],
    ...(options.cssVars ? { cssVars: options.cssVars } : {}),
    ...(options.css ? { css: options.css } : {}),
    ...(options.envVars ? { envVars: options.envVars } : {}),
    meta: {
      repopress: {
        apiVersion: 1,
        version: "1.0.0",
        kind: "mdx-component",
        logicalId: options.id,
        mdxName,
        exportName: mdxName,
        frameworks: ["next", "fumadocs"],
        preview: { fixtures: [] },
        authoring: {
          runtime: "client",
          schemaStatus: "complete",
          props: [],
          slots: [],
          provenance: {
            source: "registry",
            registryItem: options.id,
            version: "1.0.0",
            integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          },
        },
      },
    },
  }
  const files = [{ path, content }]
  item.meta.repopress.authoring.provenance.integrity = computeRegistryItemIntegrity({ item, files })
  return {
    reference: options.ref ?? options.id,
    item,
    files,
    resolved: { address: `https://registry.example/${name}.json`, sourceRef: "v1.0.0", resolvedRef: REF },
  }
}

function layout(componentsPath = "components", importPrefix = "@/components"): ProjectInstallLayout {
  return {
    framework: "next",
    aliases: [{ name: "@components", path: componentsPath, importPrefix }],
    runtimeMapPath: "mdx-components.tsx",
    cssTarget: "app/globals.css",
    lockPath: "repopress.lock.json",
  }
}

function plan(sources: RegistrySourceInput[], extra: Partial<Parameters<typeof planRegistryInstall>[0]> = {}) {
  const resolved = resolveRegistryItems({ requested: [sources.at(-1)?.reference ?? ""], sources, framework: "next" })
  return planRegistryInstall({
    resolved,
    layout: layout(),
    currentFiles: [
      { path: "mdx-components.tsx", content: runtimeSource },
      { path: "package.json", content: '{"dependencies":{"react":"19.2.0"}}\n' },
      { path: "app/globals.css", content: "@import 'tailwindcss';\n" },
    ],
    currentLock: null,
    ...extra,
  })
}

describe("planRegistryInstall", () => {
  it.each([
    ["root", "components", "@/components", "components/repopress/callout.tsx", "@/components/repopress/callout"],
    ["src", "src/components", "@/components", "src/components/repopress/callout.tsx", "@/components/repopress/callout"],
    [
      "workspace",
      "packages/docs/ui",
      "@docs/ui",
      "packages/docs/ui/repopress/callout.tsx",
      "@docs/ui/repopress/callout",
    ],
  ])("resolves portable targets for a %s shadcn layout", (_, componentsPath, importPrefix, target, importSource) => {
    const source = registrySource({ id: "@repopress/callout" })
    const resolved = resolveRegistryItems({ requested: [source.reference], sources: [source], framework: "next" })
    const result = planRegistryInstall({
      resolved,
      layout: layout(componentsPath, importPrefix),
      currentFiles: [{ path: "mdx-components.tsx", content: "export const components = {}\n" }],
      currentLock: null,
    })
    expect(result.fileChanges).toContainEqual(expect.objectContaining({ path: target, after: source.files[0].content }))
    expect(result.runtimeMapEdit.after).toContain(`from "${importSource}"`)
  })

  it("plans dependency-first files, package/CSS diffs, runtime map, and a valid lock deterministically", () => {
    const icon = registrySource({ id: "@repopress/icon", ref: "icon", packages: ["lucide-react@^0.500.0"] })
    const callout = registrySource({
      id: "@repopress/callout",
      deps: ["icon"],
      packages: ["react", "class-variance-authority@^0.7.1"],
      cssVars: { light: { "callout-accent": "oklch(0.5 0.1 250)" } },
    })
    const result = plan([icon, callout])

    expect(result.applicable).toBe(true)
    expect(result.fileChanges.slice(0, 2).map((change) => change.owner)).toEqual([
      "@repopress/icon",
      "@repopress/callout",
    ])
    expect(result.packageChanges).toEqual([
      { kind: "dependency", name: "class-variance-authority", before: null, after: "^0.7.1" },
      { kind: "dependency", name: "lucide-react", before: null, after: "^0.500.0" },
    ])
    expect(result.cssChanges).toEqual([
      {
        itemId: "@repopress/callout",
        selector: ":root",
        name: "--callout-accent",
        before: null,
        after: "oklch(0.5 0.1 250)",
      },
    ])
    expect(result.runtimeMapEdit.after).toContain("Callout")
    expect(result.runtimeMapEdit.after).toContain("Icon")
    expect(Object.keys(result.lockSnapshot.items)).toEqual(["@repopress/callout", "@repopress/icon"])
    expect(result.conflicts).toEqual([])
    expect(result.warnings).toEqual([])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.fileChanges)).toBe(true)
    expect(Object.isFrozen(result.lockSnapshot)).toBe(true)
  })

  it("reports canonical cross-platform target collisions and never silently overwrites", () => {
    const first = registrySource({ id: "@example/one", target: "@components/Callout.tsx" })
    const second = registrySource({ id: "@example/two", target: "@components/callout.tsx" })
    const resolved = resolveRegistryItems({
      requested: [first.reference, second.reference],
      sources: [first, second],
      framework: "next",
    })
    const result = planRegistryInstall({
      resolved,
      layout: layout(),
      currentFiles: [{ path: "mdx-components.tsx", content: runtimeSource }],
      currentLock: null,
    })
    expect(result.applicable).toBe(false)
    expect(result.conflicts).toContainEqual(expect.objectContaining({ code: "TARGET_COLLISION" }))

    const local = plan([registrySource({ id: "@example/new", target: "@components/existing.tsx" })], {
      currentFiles: [
        { path: "mdx-components.tsx", content: runtimeSource },
        { path: "components/existing.tsx", content: "local" },
      ],
    })
    expect(local.conflicts).toContainEqual(expect.objectContaining({ code: "UNMANAGED_TARGET_EXISTS" }))
  })

  it("detects local modifications using lock-recorded target content digests", () => {
    const item = registrySource({ id: "@repopress/callout" })
    const initial = plan([item])
    const target = initial.fileChanges.find((change) => change.owner === "@repopress/callout")
    expect(target).toBeDefined()
    const modified = plan([item], {
      currentFiles: [
        { path: "mdx-components.tsx", content: runtimeSource },
        { path: target?.path ?? "", content: "local edit" },
      ],
      currentLock: initial.lockSnapshot,
    })
    expect(modified.applicable).toBe(false)
    expect(modified.conflicts).toContainEqual(
      expect.objectContaining({ code: "LOCAL_MODIFICATION", path: target?.path }),
    )
    expect(initial.lockSnapshot.items["@repopress/callout"].targets[0].digest).toBe(sha(item.files[0].content))
  })

  it("reports version/integrity lock changes and refuses a resolved item with mismatched integrity", () => {
    const item = registrySource({ id: "@repopress/callout" })
    const initial = plan([item])
    const changed = registrySource({ id: "@repopress/callout", content: `${item.files[0].content}// v2\n` })
    ;(changed.item as any).meta.repopress.version = "1.1.0"
    ;(changed.item as any).meta.repopress.authoring.provenance.version = "1.1.0"
    ;(changed.item as any).meta.repopress.authoring.provenance.integrity = computeRegistryItemIntegrity({
      item: changed.item,
      files: changed.files,
    })
    changed.resolved.sourceRef = "v1.1.0"
    const update = plan([changed], { currentLock: initial.lockSnapshot })
    expect(update.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["VERSION_CHANGE", "INTEGRITY_CHANGE"]),
    )

    ;(changed.files[0] as { content: string }).content += "tampered"
    expect(() =>
      resolveRegistryItems({ requested: [changed.reference], sources: [changed], framework: "next" }),
    ).toThrow("Registry integrity mismatch")
  })

  it("returns the exact same immutable plan for dry-run and orders output independently of input order", () => {
    const a = registrySource({ id: "@example/a", ref: "a" })
    const b = registrySource({ id: "@example/b", ref: "b", deps: ["a"] })
    const firstResolved = resolveRegistryItems({ requested: ["b"], sources: [b, a], framework: "next" })
    const secondResolved = resolveRegistryItems({ requested: ["b"], sources: [a, b], framework: "next" })
    const input = {
      layout: layout(),
      currentFiles: [{ path: "mdx-components.tsx", content: "export const components = {}\n" }],
      currentLock: null,
    }
    const first = planRegistryInstall({ resolved: firstResolved, ...input })
    const second = planRegistryInstall({ resolved: secondResolved, ...input })
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(dryRunInstallPlan(first)).toBe(first)
  })

  it("fails closed for unresolved aliases, environment requests, and unsupported or networked CSS", () => {
    const unknownAlias = plan([registrySource({ id: "@example/alias", target: "@unknown/value.tsx" })])
    expect(unknownAlias.conflicts).toContainEqual(expect.objectContaining({ code: "UNKNOWN_TARGET_ALIAS" }))

    const env = plan([registrySource({ id: "@example/env", envVars: { API_TOKEN: "required" } })])
    expect(env.conflicts).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_ENV_VARS" }))

    const css = plan([registrySource({ id: "@example/css", css: { "@import": "https://example.test/x.css" } })])
    expect(css.conflicts).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_CSS" }))

    const networked = plan([
      registrySource({ id: "@example/networked", cssVars: { light: { image: "url(https://example.test/a.png)" } } }),
    ])
    expect(networked.conflicts).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_CSS" }))
  })

  it("plans a deterministic package version update instead of ignoring an existing mismatch", () => {
    const item = registrySource({ id: "@example/package", packages: ["class-variance-authority@^0.7.1"] })
    const result = plan([item], {
      currentFiles: [
        { path: "mdx-components.tsx", content: runtimeSource },
        { path: "package.json", content: '{"dependencies":{"class-variance-authority":"^0.6.0"}}\n' },
      ],
    })

    expect(result.packageChanges).toEqual([
      {
        kind: "dependency",
        name: "class-variance-authority",
        before: "^0.6.0",
        after: "^0.7.1",
      },
    ])
    expect(result.fileChanges.find((change) => change.kind === "package")?.after).toContain('"^0.7.1"')
  })

  it("reserves runtime, package, CSS, and lock paths from registry file targets", () => {
    for (const [index, target] of [
      "mdx-components.tsx",
      "package.json",
      "app/globals.css",
      "repopress.lock.json",
    ].entries()) {
      const result = plan([registrySource({ id: `@example/system${index}`, target })])
      expect(result.conflicts).toContainEqual(expect.objectContaining({ code: "TARGET_COLLISION", path: target }))
    }
  })

  it("returns a conflict when a new item targets a path owned by another locked item", () => {
    const installed = registrySource({ id: "@example/installed", target: "@components/shared.tsx" })
    const initial = plan([installed])
    const installedChange = initial.fileChanges.find((change) => change.owner === "@example/installed")
    const replacement = registrySource({ id: "@example/replacement", target: "@components/shared.tsx" })

    const result = plan([replacement], {
      currentFiles: [
        { path: "mdx-components.tsx", content: runtimeSource },
        { path: installedChange?.path ?? "components/shared.tsx", content: installed.files[0].content },
      ],
      currentLock: initial.lockSnapshot,
    })

    expect(result.applicable).toBe(false)
    expect(result.conflicts).toContainEqual(expect.objectContaining({ code: "TARGET_COLLISION" }))
  })

  it("does not overwrite an unmanaged lockfile snapshot", () => {
    const result = plan([registrySource({ id: "@example/new" })], {
      currentFiles: [
        { path: "mdx-components.tsx", content: runtimeSource },
        { path: "repopress.lock.json", content: '{"owned":"elsewhere"}\n' },
      ],
      currentLock: null,
    })
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({ code: "UNMANAGED_TARGET_EXISTS", path: "repopress.lock.json" }),
    )
  })
})
