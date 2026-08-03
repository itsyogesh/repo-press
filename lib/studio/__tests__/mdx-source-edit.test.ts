import { describe, expect, it } from "vitest"
import { buildAuthoringCatalog } from "../authoring-catalog"
import {
  buildComponentEditIdentityIndex,
  editComponentProp,
  findEditableMdxComponents,
  prepareComponentPropEdit,
} from "../mdx-source-edit"

function targetFor(source: string, name: string, occurrence = 0) {
  const discovered = findEditableMdxComponents(source)
  expect(discovered.ok).toBe(true)
  if (!discovered.ok) throw new Error("expected editable MDX")
  const targets = discovered.targets.filter((target) => target.name === name)
  expect(targets.length).toBeGreaterThan(occurrence)
  return targets[occurrence]
}

describe("source-preserving MDX component prop edits", () => {
  it("captures a positionless rendered node by unique literal attributes", () => {
    const source = '<Callout title="First" variant="accent" />\n\n<Callout title="Second" variant="accent" />'
    const index = buildComponentEditIdentityIndex(source)
    expect(index.ok).toBe(true)
    if (!index.ok) throw new Error("expected identity index")

    expect(
      index.capture({
        name: "Callout",
        kind: "flow",
        attributes: [
          { type: "mdxJsxAttribute", name: "variant", value: "accent" },
          { type: "mdxJsxAttribute", name: "title", value: "Second" },
        ],
      }),
    ).toMatchObject({ ok: true, identity: { name: "Callout", openingTag: expect.stringContaining("Second") } })
  })

  it("fails closed when a positionless structural identity is still ambiguous", () => {
    const source = '<Callout variant="accent" />\n\n<Callout variant="accent" />'
    const index = buildComponentEditIdentityIndex(source)
    expect(index.ok).toBe(true)
    if (!index.ok) throw new Error("expected identity index")

    expect(
      index.capture({
        name: "Callout",
        kind: "flow",
        attributes: [{ type: "mdxJsxAttribute", name: "variant", value: "accent" }],
      }),
    ).toEqual({ ok: false, source, code: "UNSAFE_TO_PRESERVE" })
  })

  it("rejects wrong-kind and non-canonical positionless anchors", () => {
    const source = '<Callout title="Safe" />'
    const index = buildComponentEditIdentityIndex(source)
    expect(index.ok).toBe(true)
    if (!index.ok) throw new Error("expected identity index")
    const attributes = [{ type: "mdxJsxAttribute", name: "title", value: "Safe" }]

    expect(index.capture({ name: "Callout", kind: "text", attributes })).toEqual({
      ok: false,
      source,
      code: "UNSAFE_TO_PRESERVE",
    })
    expect(
      index.capture({
        name: "Callout",
        kind: "flow",
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "title",
            value: { type: "mdxJsxAttributeValueExpression", value: "computeTitle()" },
          },
        ],
      }),
    ).toEqual({ ok: false, source, code: "UNSAFE_TO_PRESERVE" })

    const accessorAttribute = Object.create(null)
    Object.defineProperty(accessorAttribute, "type", {
      enumerable: true,
      get: () => {
        throw new Error("must not execute")
      },
    })
    expect(index.capture({ name: "Callout", kind: "flow", attributes: [accessorAttribute] })).toEqual({
      ok: false,
      source,
      code: "UNSAFE_TO_PRESERVE",
    })
  })

  it("prepares one exact position-bound literal component without confusing duplicates", () => {
    const source = '<Callout title="First" />\n<Callout title="Second" variant="accent">Body</Callout>'
    const def = buildAuthoringCatalog({
      metadata: {
        Callout: {
          props: [
            { name: "title", type: "string" },
            { name: "variant", type: "string", options: ["default", "accent"] },
          ],
          slots: [{ name: "children", accepts: "mdx", required: true }],
        },
      },
    })[0]
    const start = source.indexOf("<Callout", 1)
    const prepared = prepareComponentPropEdit(source, { name: "Callout", start, sourceSnapshot: source }, def)

    expect(prepared).toMatchObject({
      ok: true,
      initialProps: { title: "Second", variant: "accent" },
      editablePropNames: ["title", "variant"],
      target: { name: "Callout", start },
    })
    if (prepared.ok) {
      expect(Object.isFrozen(prepared)).toBe(true)
      expect(Object.isFrozen(prepared.initialProps)).toBe(true)
      expect(Object.isFrozen(prepared.target)).toBe(true)
    }
  })

  it("refuses position-bound preparation for spreads and expression-backed props", () => {
    const def = buildAuthoringCatalog({
      metadata: { Callout: { props: [{ name: "title", type: "string" }], hasChildren: false } },
    })[0]
    for (const source of ["<Callout {...props} />", "<Callout title={computeTitle()} />"]) {
      expect(prepareComponentPropEdit(source, { name: "Callout", start: 0, sourceSnapshot: source }, def)).toEqual({
        ok: false,
        source,
        code: "UNSAFE_TO_PRESERVE",
      })
    }
  })

  it("prepares and edits canonical boolean and numeric expression literals", () => {
    const source = "<Widget enabled={false} count={2.5} />"
    const def = buildAuthoringCatalog({
      metadata: {
        Widget: {
          props: [
            { name: "enabled", type: "boolean" },
            { name: "count", type: "number" },
          ],
          hasChildren: false,
        },
      },
    })[0]
    const prepared = prepareComponentPropEdit(source, { name: "Widget", start: 0, sourceSnapshot: source }, def)

    expect(prepared).toMatchObject({ ok: true, initialProps: { enabled: false, count: 2.5 } })
    if (!prepared.ok) throw new Error("expected canonical literals to be editable")
    expect(editComponentProp(source, prepared.target, { enabled: true })).toEqual({
      ok: true,
      source: "<Widget enabled={true} count={2.5} />",
    })
  })

  it("continues to refuse non-canonical and non-finite expression values", () => {
    const def = buildAuthoringCatalog({
      metadata: {
        Widget: {
          props: [
            { name: "enabled", type: "boolean" },
            { name: "count", type: "number" },
          ],
          hasChildren: false,
        },
      },
    })[0]
    for (const source of [
      "<Widget enabled={computeEnabled()} count={2} />",
      "<Widget enabled={false} count={Infinity} />",
      "<Widget enabled={flag} count={2} />",
    ]) {
      expect(prepareComponentPropEdit(source, { name: "Widget", start: 0, sourceSnapshot: source }, def)).toEqual({
        ok: false,
        source,
        code: "UNSAFE_TO_PRESERVE",
      })
    }
  })

  it("refuses a retained position when its node snapshot differs from current source", () => {
    const source = '<Callout title="Alpha" />\n<Callout title="Bravo" />'
    const swapped = '<Callout title="Bravo" />\n<Callout title="Alpha" />'
    const def = buildAuthoringCatalog({
      metadata: { Callout: { props: [{ name: "title", type: "string" }], hasChildren: false } },
    })[0]
    const start = source.indexOf("<Callout", 1)

    expect(prepareComponentPropEdit(swapped, { name: "Callout", start, sourceSnapshot: source }, def)).toEqual({
      ok: false,
      source: swapped,
      code: "UNSAFE_TO_PRESERVE",
    })
  })

  it("reacquires one unique retained opening-tag identity after an unrelated preceding edit", () => {
    const source = '<Callout title="First" />\n<Callout title="Second" variant="accent">Body</Callout>'
    const latest = `Unrelated preface\n\n${source}`
    const retained = targetFor(source, "Callout", 1)
    const def = buildAuthoringCatalog({
      metadata: {
        Callout: {
          props: [
            { name: "title", type: "string" },
            { name: "variant", type: "string" },
          ],
          slots: [{ name: "children", accepts: "mdx", required: true }],
        },
      },
    })[0]

    expect(
      prepareComponentPropEdit(
        latest,
        {
          name: retained.name,
          kind: retained.kind,
          openingTag: retained.openingTag,
          nodeSource: retained.nodeSource,
        },
        def,
      ),
    ).toMatchObject({
      ok: true,
      initialProps: { title: "Second", variant: "accent" },
      target: { start: latest.lastIndexOf("<Callout"), sourceSnapshot: latest },
    })
  })

  it("refuses to rebind a retained opening tag to a different component body", () => {
    const original =
      '<Callout title="Alpha" variant="accent">One</Callout>\n<Callout title="Bravo" variant="accent">Two</Callout>'
    const latest =
      '<Callout title="Bravo" variant="accent">One</Callout>\n<Callout title="Alpha" variant="accent">Two</Callout>'
    const retained = targetFor(original, "Callout", 1)
    const def = buildAuthoringCatalog({
      metadata: {
        Callout: {
          props: [
            { name: "title", type: "string" },
            { name: "variant", type: "string" },
          ],
          slots: [{ name: "children", accepts: "mdx", required: true }],
        },
      },
    })[0]

    expect(
      prepareComponentPropEdit(
        latest,
        {
          name: retained.name,
          kind: retained.kind,
          openingTag: retained.openingTag,
          nodeSource: retained.nodeSource,
        },
        def,
      ),
    ).toEqual({ ok: false, source: latest, code: "UNSAFE_TO_PRESERVE" })
  })

  it("distinguishes equal opening tags by exact retained full-node source", () => {
    const source = '<Callout title="Same">One</Callout>\n<Callout title="Same">Two</Callout>'
    const latest = `Unrelated preface\n\n${source}`
    const retained = targetFor(source, "Callout", 1)
    const def = buildAuthoringCatalog({
      metadata: {
        Callout: {
          props: [{ name: "title", type: "string" }],
          slots: [{ name: "children", accepts: "mdx", required: true }],
        },
      },
    })[0]

    expect(
      prepareComponentPropEdit(
        latest,
        {
          name: retained.name,
          kind: retained.kind,
          openingTag: retained.openingTag,
          nodeSource: retained.nodeSource,
        },
        def,
      ),
    ).toMatchObject({ ok: true, target: { start: latest.lastIndexOf("<Callout"), sourceSnapshot: latest } })
  })

  it("maps an initial MDXEditor offset from its trimmed parser source without confusing duplicates", () => {
    const source = '\n\n<Callout title="First" />\n<Callout title="Second" />\n'
    const importedSource = source.trim()
    const def = buildAuthoringCatalog({
      metadata: { Callout: { props: [{ name: "title", type: "string" }], hasChildren: false } },
    })[0]
    const importedStart = importedSource.indexOf("<Callout", 1)

    expect(
      prepareComponentPropEdit(source, { name: "Callout", start: importedStart, sourceSnapshot: source }, def),
    ).toMatchObject({
      ok: true,
      initialProps: { title: "Second" },
      target: { name: "Callout", start: source.lastIndexOf("<Callout") },
    })
  })

  it("refuses when raw and trim-adjusted offsets both look like the requested duplicate", () => {
    const importedSource = '<Callout />\n<Callout title="Intended" />'
    const source = `${" ".repeat("<Callout />\n".length)}${importedSource}`
    const def = buildAuthoringCatalog({
      metadata: { Callout: { props: [{ name: "title", type: "string" }], hasChildren: false } },
    })[0]

    expect(
      prepareComponentPropEdit(
        source,
        { name: "Callout", start: importedSource.lastIndexOf("<Callout"), sourceSnapshot: source },
        def,
      ),
    ).toEqual({ ok: false, source, code: "UNSAFE_TO_PRESERVE" })
  })

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
