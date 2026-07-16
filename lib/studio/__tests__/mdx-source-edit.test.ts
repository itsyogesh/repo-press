import { describe, expect, it } from "vitest"
import { editComponentProp, findEditableMdxComponents } from "../mdx-source-edit"

function targetFor(source: string, name: string, occurrence = 0) {
  const discovered = findEditableMdxComponents(source)
  expect(discovered.ok).toBe(true)
  if (!discovered.ok) throw new Error("expected editable MDX")
  const targets = discovered.targets.filter((target) => target.name === name)
  expect(targets.length).toBeGreaterThan(occurrence)
  return targets[occurrence]
}

describe("source-preserving MDX component prop edits", () => {
  it("returns byte-identical source for a semantic no-op", () => {
    const source =
      "import { Callout } from './callout'\r\n\r\n<Callout  title='Before' enabled={flag}>Body</Callout>\r\n"
    const result = editComponentProp(source, targetFor(source, "Callout"), { title: "Before" })

    expect(result).toEqual({ ok: true, source })
  })

  it("changes only one literal prop and preserves every unrelated byte", () => {
    const source = [
      "import { Callout } from './callout'",
      "",
      "export const answer = 42 // keep this comment",
      "",
      "<Callout  title='Before' enabled={isEnabled} data-id = \"one\">",
      '  children stay <Badge title="Elsewhere" />',
      "</Callout>",
    ].join("\r\n")
    const result = editComponentProp(source, targetFor(source, "Callout"), { title: "Changed" })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source.replace("title='Changed'", "title='Before'")).toBe(source)
  })

  it("uses node paths and exact opening bytes to distinguish duplicate components", () => {
    const source = '<Card title="First" />\n<Card title="Second" />'
    const second = targetFor(source, "Card", 1)
    const result = editComponentProp(source, second, { title: "Changed" })

    expect(result).toEqual({ ok: true, source: '<Card title="First" />\n<Card title="Changed" />' })
  })

  it("walks through MDX fragments without treating them as unnamed components", () => {
    const source = '<>\n  <Callout title="Before" />\n</>'
    const result = editComponentProp(source, targetFor(source, "Callout"), { title: "After" })

    expect(result).toEqual({ ok: true, source: '<>\n  <Callout title="After" />\n</>' })
  })

  it("preserves CRLF and UTF-16 offsets after astral Unicode", () => {
    const source = '😀 heading\r\n\r\n<Callout title="Before" />\r\n'
    const result = editComponentProp(source, targetFor(source, "Callout"), { title: "After" })

    expect(result).toEqual({ ok: true, source: '😀 heading\r\n\r\n<Callout title="After" />\r\n' })
  })

  it("fails closed when the source changed after target discovery", () => {
    const source = '<Callout title="Before" />'
    const target = targetFor(source, "Callout")
    const concurrent = `prefix\n${source}`

    expect(editComponentProp(concurrent, target, { title: "Changed" })).toEqual({
      ok: false,
      source: concurrent,
      code: "UNSAFE_TO_PRESERVE",
    })
    const changedOutsideTarget = `${source}\nUnrelated concurrent edit`
    expect(editComponentProp(changedOutsideTarget, target, { title: "Changed" })).toEqual({
      ok: false,
      source: changedOutsideTarget,
      code: "UNSAFE_TO_PRESERVE",
    })
  })

  it("fails closed for an unknown or forged target", () => {
    const source = '<Callout title="Before" />'
    const target = targetFor(source, "Callout")

    expect(editComponentProp(source, { ...target, name: "Other" }, { title: "Changed" })).toEqual({
      ok: false,
      source,
      code: "UNSAFE_TO_PRESERVE",
    })
  })

  it("fails closed rather than converting an expression prop to a string", () => {
    const source = "<Callout title={computeTitle()} untouched={value} />"

    expect(editComponentProp(source, targetFor(source, "Callout"), { title: "Changed" })).toEqual({
      ok: false,
      source,
      code: "UNSAFE_TO_PRESERVE",
    })
  })

  it("preserves unrelated expressions while adding a safe literal prop", () => {
    const source = "<Callout enabled={isEnabled} />"
    const result = editComponentProp(source, targetFor(source, "Callout"), { title: "Safe" })

    expect(result).toEqual({ ok: true, source: '<Callout enabled={isEnabled} title="Safe" />' })
  })

  it("supports literal boolean updates and explicit prop removal without touching children", () => {
    const source = '<Callout enabled title="Remove">\nBody\n</Callout>'
    const result = editComponentProp(source, targetFor(source, "Callout"), { enabled: false, title: undefined })

    expect(result).toEqual({ ok: true, source: "<Callout enabled={false}>\nBody\n</Callout>" })
  })

  it("fails closed for ambiguous spread or duplicate attributes", () => {
    for (const source of ["<Callout {...props} />", '<Callout title="a" title="b" />']) {
      expect(editComponentProp(source, targetFor(source, "Callout"), { title: "Changed" })).toEqual({
        ok: false,
        source,
        code: "UNSAFE_TO_PRESERVE",
      })
    }
  })

  it("fails closed on malformed MDX and bounded-parser preflight failures", () => {
    const malformed = '<Callout title="unterminated>'
    expect(findEditableMdxComponents(malformed)).toEqual({
      ok: false,
      source: malformed,
      code: "UNSAFE_TO_PRESERVE",
    })

    const oversized = `<Callout />${"界".repeat(175_000)}`
    expect(findEditableMdxComponents(oversized)).toEqual({
      ok: false,
      source: oversized,
      code: "UNSAFE_TO_PRESERVE",
    })

    const nodeFlood = Array.from({ length: 5_100 }, (_, index) => `# heading-${index}`).join("\n")
    expect(findEditableMdxComponents(nodeFlood)).toEqual({
      ok: false,
      source: nodeFlood,
      code: "UNSAFE_TO_PRESERVE",
    })

    const tooDeep = `${Array.from({ length: 80 }, () => "<Box>").join("\n")}\nbody\n${Array.from(
      { length: 80 },
      () => "</Box>",
    ).join("\n")}`
    expect(findEditableMdxComponents(tooDeep)).toEqual({
      ok: false,
      source: tooDeep,
      code: "UNSAFE_TO_PRESERVE",
    })
  })

  it("rejects unsafe names, unsupported values, accessors, and prototype-bearing changes", () => {
    const source = "<Callout />"
    const target = targetFor(source, "Callout")
    const accessor = Object.defineProperty({}, "title", { enumerable: true, get: () => "injected" })
    const inherited = Object.create({ title: "injected" }) as Record<string, unknown>
    inherited.tone = "safe"

    for (const changes of [
      { constructor: "injected" },
      { title: { toString: () => "injected" } },
      accessor,
      inherited,
    ]) {
      expect(editComponentProp(source, target, changes)).toEqual({
        ok: false,
        source,
        code: "UNSAFE_TO_PRESERVE",
      })
    }
  })

  it("fails closed for accessor-bearing or proxied target identities", () => {
    const source = "<Callout />"
    const target = targetFor(source, "Callout")
    const accessorTarget = Object.defineProperty({ ...target }, "name", {
      enumerable: true,
      get: () => "Callout",
    })
    const proxyTarget = new Proxy(target, {
      getPrototypeOf() {
        throw new Error("must not escape")
      },
    })

    for (const forged of [accessorTarget, proxyTarget]) {
      expect(editComponentProp(source, forged, { title: "After" })).toEqual({
        ok: false,
        source,
        code: "UNSAFE_TO_PRESERVE",
      })
    }
  })

  it("escapes string literals without permitting source injection", () => {
    const source = "<Callout />"
    const result = editComponentProp(source, targetFor(source, "Callout"), {
      title: 'close" /><Injected /> & continue',
    })

    expect(result).toEqual({
      ok: true,
      source: '<Callout title="close&quot; /&gt;&lt;Injected /&gt; &amp; continue" />',
    })
  })
})
