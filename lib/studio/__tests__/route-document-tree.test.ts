import { describe, expect, it } from "vitest"
import type { OverlayTreeNode } from "@/lib/explorer-tree-overlay"
import type { FileTreeNode } from "@/lib/github"
import { buildRouteDocumentTree } from "@/lib/studio/route-document-tree"

function file(path: string, overrides: Partial<OverlayTreeNode> = {}): OverlayTreeNode {
  return {
    name: path.split("/").pop() ?? path,
    path,
    sha: `sha:${path}`,
    type: "file",
    ...overrides,
  }
}

function dir(path: string, children: FileTreeNode[]): OverlayTreeNode {
  return {
    name: path.split("/").pop() ?? path,
    path,
    sha: `sha:${path}`,
    type: "dir",
    children,
  }
}

describe("buildRouteDocumentTree", () => {
  it.each([
    "page.md",
    "page.mdx",
    "index.md",
    "index.mdx",
  ])("compacts a next-mdx route containing only %s into the exact route-document shape", (fileName) => {
    const source = file(`content/getting-started/${fileName}`)
    const route = dir("content/getting-started", [source])

    const result = buildRouteDocumentTree([route], {
      detectedFramework: "next-mdx",
      titleMap: { [source.path]: "A Better Beginning" },
    })

    expect(result).toEqual([
      {
        kind: "route-document",
        routePath: "content/getting-started",
        segment: "getting-started",
        source,
        label: "A Better Beginning",
        secondaryLabel: "getting-started",
        canDrag: false,
        canRename: false,
      },
    ])
    expect(result[0]?.source).toBe(source)
    expect(route.children).toEqual([source])
  })

  it("does not compact the same route folder for another framework", () => {
    const source = file("content/getting-started/page.mdx")
    const route = dir("content/getting-started", [source])

    expect(buildRouteDocumentTree([route], { detectedFramework: "fumadocs" })).toEqual([
      {
        kind: "node",
        source: route,
        children: [{ kind: "node", source }],
      },
    ])
  })

  it.each(["PAGE.MDX", "Index.md"])("does not compact case-variant route leaf %s", (fileName) => {
    const source = file(`content/getting-started/${fileName}`)
    const route = dir("content/getting-started", [source])

    expect(buildRouteDocumentTree([route], { detectedFramework: "next-mdx" })).toEqual([
      {
        kind: "node",
        source: route,
        children: [{ kind: "node", source }],
      },
    ])
  })

  it("does not compact a route folder with multiple visible children", () => {
    const source = file("content/getting-started/page.mdx")
    const notes = file("content/getting-started/notes.mdx")
    const route = dir("content/getting-started", [source, notes])

    expect(buildRouteDocumentTree([route], { detectedFramework: "next-mdx" })[0]).toEqual({
      kind: "node",
      source: route,
      children: [
        { kind: "node", source },
        { kind: "node", source: notes },
      ],
    })
  })

  it("does not compact a route folder that also contains a nested route", () => {
    const source = file("content/guides/page.mdx")
    const nestedSource = file("content/guides/advanced/page.mdx")
    const nestedRoute = dir("content/guides/advanced", [nestedSource])
    const route = dir("content/guides", [source, nestedRoute])

    const result = buildRouteDocumentTree([route], { detectedFramework: "next-mdx" })

    expect(result[0]?.kind).toBe("node")
    expect(result[0]?.source).toBe(route)
  })

  it("does not compact a route whose document leaf is deleted", () => {
    const source = file("content/getting-started/page.mdx", { isDeleted: true })
    const route = dir("content/getting-started", [source])

    expect(buildRouteDocumentTree([route], { detectedFramework: "next-mdx" })[0]).toEqual({
      kind: "node",
      source: route,
      children: [{ kind: "node", source }],
    })
  })

  it("humanizes the route segment when the document has no title", () => {
    const source = file("content/getting-started/page.mdx")

    expect(
      buildRouteDocumentTree([dir("content/getting-started", [source])], { detectedFramework: "next-mdx" }),
    ).toEqual([
      {
        kind: "route-document",
        routePath: "content/getting-started",
        segment: "getting-started",
        source,
        label: "Getting Started",
        secondaryLabel: "getting-started",
        canDrag: false,
        canRename: false,
      },
    ])
  })

  it("keeps a root page as an ordinary file node", () => {
    const source = file("content/page.mdx")

    expect(buildRouteDocumentTree([source], { detectedFramework: "next-mdx" })).toEqual([{ kind: "node", source }])
  })
})
