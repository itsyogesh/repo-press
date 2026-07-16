import { describe, expect, it } from "vitest"
import { adaptRuntimeMap } from "../runtime-map-adapter"

const binding = { mdxName: "Callout", exportName: "Callout", importSource: "@/components/repopress/callout" }

describe("adaptRuntimeMap", () => {
  it("surgically updates an exported useMDXComponents function", () => {
    const source = `import type { MDXComponents } from "mdx/types"\n\n// keep this comment\nexport function useMDXComponents(components: MDXComponents): MDXComponents {\n  return {\n    h1: (props) => <h1 {...props} />,\n    ...components,\n  }\n}\n`
    const result = adaptRuntimeMap({ source, bindings: [binding] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('import { Callout } from "@/components/repopress/callout"')
    expect(result.source).toContain("    Callout,\n    h1:")
    expect(result.source).toContain("// keep this comment")
    expect(
      result.source
        .replace('import { Callout } from "@/components/repopress/callout"\n', "")
        .replace("    Callout,\n", ""),
    ).toBe(source)
    expect(adaptRuntimeMap({ source: result.source, bindings: [binding] })).toEqual({
      ok: true,
      source: result.source,
      changed: false,
    })
  })

  it.each([
    [
      "named component map",
      `import type { MDXComponents } from "mdx/types"\nexport const components: MDXComponents = {\n  strong: "strong",\n}\n`,
    ],
    [
      "default component map",
      `import type { MDXComponents } from "mdx/types"\nconst defaults = {\n  strong: "strong",\n}\nexport default defaults\n`,
    ],
    [
      "no-argument Next map",
      `import type { MDXComponents } from "mdx/types"\nexport function useMDXComponents(): MDXComponents {\n  return {\n    strong: "strong",\n  }\n}\n`,
    ],
    [
      "optional-argument Fumadocs map",
      `import type { MDXComponents } from "mdx/types"\nexport function getMDXComponents(components?: MDXComponents): MDXComponents {\n  return {\n    strong: "strong",\n    ...components,\n  }\n}\n`,
    ],
  ])("updates an exported %s without reprinting unrelated syntax", (_, source) => {
    const result = adaptRuntimeMap({ source, bindings: [binding] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const indent = source.includes("function ") ? "    " : "  "
    expect(result.source).toContain(`${indent}Callout,\n${indent}strong:`)
    expect(result.source).toContain('import { Callout } from "@/components/repopress/callout"')
  })

  it("preserves CRLF and supports aliased exports", () => {
    const source = 'import type { MDXComponents } from "mdx/types"\r\nexport const components: MDXComponents = {}\r\n'
    const result = adaptRuntimeMap({ source, bindings: [{ ...binding, mdxName: "Notice", exportName: "Callout" }] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('import { Callout as Notice } from "@/components/repopress/callout"\r\n')
    expect(result.source.replaceAll("\r\n", "")).not.toContain("\n")
  })

  it("adds the required separator when editing a non-empty one-line map", () => {
    const source = 'export const components = { strong: "strong" }\n'
    const result = adaptRuntimeMap({ source, bindings: [binding] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('{ Callout, strong: "strong" }')
  })

  it("rejects local-name and import collisions without changing source", () => {
    for (const source of [
      'import { Callout } from "somewhere-else"\nexport const components = {}\n',
      "const Callout = () => null\nexport const components = {}\n",
      'import { Other } from "@/components/repopress/callout"\nexport const components = {}\n',
    ]) {
      const result = adaptRuntimeMap({ source, bindings: [binding] })
      expect(result).toMatchObject({ ok: false, source, code: "BINDING_COLLISION" })
    }
  })

  it("requires an existing map property to reference the exact imported binding", () => {
    const exactImport = 'import { Callout } from "@/components/repopress/callout"\n'
    for (const property of [
      "Callout: Other",
      "Callout() { return null }",
      "get Callout() { return Other }",
      "Callout: factory()",
    ]) {
      const source = `${exactImport}export const components = { ${property} }\n`
      expect(adaptRuntimeMap({ source, bindings: [binding] })).toMatchObject({
        ok: false,
        source,
        code: "BINDING_COLLISION",
      })
    }

    for (const property of ["Callout", "Callout: Callout"]) {
      const source = `${exactImport}export const components = { ${property} }\n`
      expect(adaptRuntimeMap({ source, bindings: [binding] })).toEqual({ ok: true, source, changed: false })
    }
  })

  it("rejects dynamic spreads and control-flow returns while retaining canonical caller precedence", () => {
    for (const source of [
      "export const components = { ...factory() }\n",
      "export const components = { ...source.components }\n",
      "export function useMDXComponents(components) { if (components) return { ...components }; return {} }\n",
      "export function getMDXComponents(components) { return condition ? { ...components } : {} }\n",
    ]) {
      expect(adaptRuntimeMap({ source, bindings: [binding] })).toMatchObject({ ok: false, source })
    }

    const canonical =
      "export function getMDXComponents(components?: Record<string, unknown>) {\n  return {\n    strong: 'strong',\n    ...components,\n  }\n}\n"
    const result = adaptRuntimeMap({ source: canonical, bindings: [binding] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.source.indexOf("Callout,")).toBeLessThan(result.source.indexOf("...components"))
  })

  it("detects value-space collisions introduced through object and array destructuring", () => {
    for (const declaration of [
      "const { component: Callout } = source",
      "const { Callout } = source",
      "const [Callout] = source",
      "const { nested: { Callout } } = source",
    ]) {
      const source = `${declaration}\nexport const components = {}\n`
      expect(adaptRuntimeMap({ source, bindings: [binding] })).toMatchObject({
        ok: false,
        source,
        code: "BINDING_COLLISION",
      })
    }
  })

  it("fails closed and preserves unsupported or malformed source byte-for-byte", () => {
    for (const source of [
      "export function makeComponents() { return {} }\n",
      "export function useMDXComponents(components) { return condition ? {} : components }\n",
      "export const components = buildComponents()\n",
      "export const components = {\n",
    ]) {
      const result = adaptRuntimeMap({ source, bindings: [binding] })
      expect(result.ok).toBe(false)
      expect(result.source).toBe(source)
      if (!result.ok) expect(result.message.length).toBeGreaterThan(10)
    }
  })

  it("orders multiple bindings deterministically and returns immutable data", () => {
    const source = "export const components = {}\n"
    const alpha = { mdxName: "Alpha", exportName: "A", importSource: "@pkg/a" }
    const first = adaptRuntimeMap({ source, bindings: [binding, alpha] })
    const second = adaptRuntimeMap({ source, bindings: [alpha, binding] })
    expect(first).toEqual(second)
    expect(Object.isFrozen(first)).toBe(true)
  })
})
