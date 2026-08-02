import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { GenericBlock, GenericRenderModel } from "@/lib/preview/generic-render-model"
import { GenericPreview } from "../GenericPreview"

describe("GenericPreview", () => {
  it("renders the safe model as semantic React elements", () => {
    const html = renderToStaticMarkup(
      <GenericPreview
        model={{
          blocks: [
            { type: "heading", depth: 2, text: "Overview", children: [{ type: "text", value: "Overview" }] },
            {
              type: "paragraph",
              children: [
                { type: "text", value: "Read " },
                { type: "link", url: "/guide", title: null, children: [{ type: "text", value: "the guide" }] },
                { type: "text", value: "." },
              ],
            },
            { type: "component-placeholder", name: "Chart" },
          ],
        }}
      />,
    )

    expect(html).toContain("<h2>Overview</h2>")
    expect(html).toContain('<a href="/guide">the guide</a>')
    expect(html).toContain('class="not-typeset not-prose')
    expect(html).toContain('data-component-name="Chart"')
    expect(html).toContain("&lt;Chart /&gt;")
  })

  it("wraps tables in the Typeset horizontal-scroll escape", () => {
    const html = renderToStaticMarkup(
      <GenericPreview
        model={{
          blocks: [
            {
              type: "table",
              align: ["left"],
              rows: [[{ children: [{ type: "text", value: "Name" }] }]],
            },
          ],
        }}
      />,
    )

    expect(html).toContain('class="typeset-scroll"')
    expect(html).toContain("<table>")
    expect(html).toContain("<thead>")
    expect(html).toContain("<tbody>")
  })

  it("escapes model text and never creates trusted HTML", () => {
    const html = renderToStaticMarkup(
      <GenericPreview
        model={{
          blocks: [
            {
              type: "paragraph",
              children: [{ type: "text", value: '<img src=x onerror="globalThis.pwned=true">' }],
            },
          ],
        }}
      />,
    )

    expect(html).toContain("&lt;img")
    expect(html).not.toContain("<img")
  })

  it("fails forged deeply nested models closed before rendering recursively", () => {
    let block: GenericBlock = { type: "paragraph", children: [{ type: "text", value: "deep-secret" }] }
    for (let depth = 0; depth < 200; depth += 1) {
      block = { type: "blockquote", blocks: [block] }
    }

    const html = renderToStaticMarkup(<GenericPreview model={{ blocks: [block] } as GenericRenderModel} />)

    expect(html).toContain("MODEL_DEPTH_LIMIT")
    expect(html).not.toContain("deep-secret")
  })

  it("fails forged invalid model fields closed", () => {
    const model = {
      blocks: [
        {
          type: "heading",
          depth: 99,
          text: "invalid-secret",
          children: [{ type: "text", value: "invalid-secret" }],
        },
      ],
    } as unknown as GenericRenderModel

    const html = renderToStaticMarkup(<GenericPreview model={model} />)

    expect(html).toContain("INVALID_MODEL")
    expect(html).not.toContain("invalid-secret")
  })
})
