import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  CompatibleRenderTreeView,
  sanitizeCompatibleRenderTree,
  sanitizeCompatibleRenderTreeWithDiagnostics,
} from "../compatible-render-tree"

describe("compatible inert render tree", () => {
  it("strips navigation, network, event, style URL, and active-content output", () => {
    const tree = sanitizeCompatibleRenderTree([
      {
        kind: "element",
        tag: "div",
        props: {
          className: "rounded border",
          style: { backgroundImage: "url(https://evil.test/leak)" },
          onClick: "steal()",
        },
        children: [
          {
            kind: "element",
            tag: "a",
            props: { href: "https://evil.test/leak", ping: "https://evil.test/ping" },
            children: [{ kind: "text", value: "Link text remains inert" }],
          },
          {
            kind: "element",
            tag: "img",
            props: { src: "https://evil.test/pixel", srcSet: "https://evil.test/2x 2x" },
            children: [],
          },
          {
            kind: "element",
            tag: "meta",
            props: { httpEquiv: "refresh", content: "0;url=https://evil.test" },
            children: [],
          },
          {
            kind: "element",
            tag: "h2",
            props: { "aria-label": "Safe heading" },
            children: [{ kind: "text", value: "Rendered safely" }],
          },
        ],
      },
    ])

    expect(tree).not.toBeNull()
    const serialized = JSON.stringify(tree)
    expect(serialized).not.toMatch(/evil\.test|href|ping|srcSet|backgroundImage|onClick|meta|img/)
    expect(serialized).toContain("Link text remains inert")

    render(<CompatibleRenderTreeView tree={tree ?? []} />)
    expect(screen.getByRole("heading", { name: "Safe heading" })).toHaveTextContent("Rendered safely")
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(document.querySelector("img, meta, script, iframe, form, style")).toBeNull()

    expect(
      sanitizeCompatibleRenderTreeWithDiagnostics([
        {
          kind: "element",
          tag: "a",
          props: { href: "https://evil.test", style: "color:red", onClick: "go", custom: "lost" },
          children: [{ kind: "element", tag: "img", props: { src: "https://evil.test" }, children: [] }],
        },
      ]),
    ).toMatchObject({
      fidelityLosses: expect.arrayContaining([
        "STATIC_INERT_LINK",
        "STATIC_INERT_MEDIA",
        "STATIC_INERT_STYLE",
        "STATIC_INERT_EVENT",
        "STATIC_INERT_PROP",
      ]),
    })
  })

  it("fails closed on excessive depth, nodes, or text instead of partially rendering", () => {
    let deep: unknown = { kind: "text", value: "leaf" }
    for (let depth = 0; depth < 40; depth += 1) {
      deep = { kind: "element", tag: "div", props: {}, children: [deep] }
    }

    expect(sanitizeCompatibleRenderTree([deep])).toBeNull()
    expect(
      sanitizeCompatibleRenderTree(Array.from({ length: 3_000 }, () => ({ kind: "text", value: "node" }))),
    ).toBeNull()
    expect(sanitizeCompatibleRenderTree([{ kind: "text", value: "x".repeat(300_000) }])).toBeNull()
  })

  it("renders approved void elements without passing a React children argument", () => {
    const tree = sanitizeCompatibleRenderTree([
      { kind: "element", tag: "hr", props: {}, children: [] },
      { kind: "element", tag: "br", props: {}, children: [] },
    ])

    const { container } = render(<CompatibleRenderTreeView tree={tree ?? []} />)
    expect(container.querySelectorAll("hr")).toHaveLength(1)
    expect(container.querySelectorAll("br")).toHaveLength(1)
  })

  it("scopes portable primitive styles without restoring navigation or media behavior", () => {
    const tree = sanitizeCompatibleRenderTree([
      {
        kind: "element",
        tag: "figure",
        props: { className: "repopress-preview-image", role: "img", "aria-label": "Merry cover" },
        children: [
          { kind: "element", tag: "figcaption", props: {}, children: [{ kind: "text", value: "Merry cover" }] },
        ],
      },
      {
        kind: "element",
        tag: "span",
        props: { className: "repopress-preview-action", role: "note" },
        children: [{ kind: "text", value: "Open letter" }],
      },
    ])
    const { container } = render(<CompatibleRenderTreeView tree={tree ?? []} />)

    expect(container.querySelector("[data-compatible-preview]")).not.toBeNull()
    expect(screen.getByRole("img", { name: "Merry cover" })).toBeInTheDocument()
    expect(screen.getByRole("note")).toHaveTextContent("Open letter")
    expect(container.querySelector("a, button, img")).toBeNull()
  })
})
