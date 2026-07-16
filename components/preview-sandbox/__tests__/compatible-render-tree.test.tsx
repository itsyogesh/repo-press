import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CompatibleRenderTreeView, sanitizeCompatibleRenderTree } from "../compatible-render-tree"

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
})
