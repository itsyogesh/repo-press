import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FileTree } from "@/components/studio/file-tree"
import type { OverlayTreeNode } from "@/lib/explorer-tree-overlay"

function routeTree(overrides: Partial<OverlayTreeNode> = {}): { tree: OverlayTreeNode[]; source: OverlayTreeNode } {
  const source: OverlayTreeNode = {
    name: "page.mdx",
    path: "content/getting-started/page.mdx",
    sha: "leaf-sha",
    type: "file",
    ...overrides,
  }
  return {
    source,
    tree: [
      {
        name: "getting-started",
        path: "content/getting-started",
        sha: "dir-sha",
        type: "dir",
        children: [source],
      },
    ],
  }
}

afterEach(cleanup)

describe("FileTree route document rows", () => {
  it("renders one accessible article row and selects the real leaf by click and keyboard", () => {
    const { tree, source } = routeTree()
    const onSelect = vi.fn()

    render(
      <FileTree
        tree={tree}
        detectedFramework="next-mdx"
        titleMap={{ [source.path]: "A Better Beginning" }}
        onSelect={onSelect}
      />,
    )

    const row = screen.getByRole("button", { name: /A Better Beginning getting-started/i })
    expect(screen.getAllByRole("button")).toEqual([row])
    expect(screen.queryByText("page.mdx")).not.toBeInTheDocument()
    expect(row).not.toHaveAttribute("aria-expanded")

    fireEvent.click(row)
    fireEvent.keyDown(row, { key: "Enter" })
    fireEvent.keyDown(row, { key: " " })

    expect(onSelect).toHaveBeenCalledTimes(3)
    expect(onSelect).toHaveBeenNthCalledWith(1, source)
    expect(onSelect).toHaveBeenNthCalledWith(2, source)
    expect(onSelect).toHaveBeenNthCalledWith(3, source)
  })

  it("reads dirty and new state from the real leaf", () => {
    const { tree, source } = routeTree({ isNew: true })

    const { rerender } = render(
      <FileTree tree={tree} detectedFramework="next-mdx" onSelect={vi.fn()} dirtyPaths={new Set()} />,
    )
    expect(screen.getByText("NEW")).toBeInTheDocument()

    delete source.isNew
    rerender(
      <FileTree tree={tree} detectedFramework="next-mdx" onSelect={vi.fn()} dirtyPaths={new Set([source.path])} />,
    )
    expect(screen.getByText("EDITED")).toBeInTheDocument()
  })

  it("deletes the real leaf and disables route-bundle rename gestures", () => {
    const { tree, source } = routeTree()
    const onDeleteFile = vi.fn()
    const onRenameFile = vi.fn()

    render(
      <FileTree
        tree={tree}
        detectedFramework="next-mdx"
        onSelect={vi.fn()}
        onDeleteFile={onDeleteFile}
        onRenameFile={onRenameFile}
      />,
    )

    const row = screen.getByRole("button", { name: /Getting Started getting-started/i })
    fireEvent.keyDown(row, { key: "F2" })
    fireEvent.doubleClick(row)
    expect(screen.queryByRole("textbox", { name: /rename/i })).not.toBeInTheDocument()
    expect(onRenameFile).not.toHaveBeenCalled()

    fireEvent.keyDown(row, { key: "Delete" })
    expect(onDeleteFile).toHaveBeenCalledWith(source.path, source.sha)
  })

  it("does not compact a deleted route leaf and preserves its deleted presentation", () => {
    const { tree } = routeTree({ isDeleted: true })

    render(<FileTree tree={tree} detectedFramework="next-mdx" onSelect={vi.fn()} />)

    expect(screen.getByText("getting-started")).toBeInTheDocument()
    expect(screen.getByText("page.mdx")).toHaveClass("line-through")
  })

  it("does not compact eligible-looking folders for other frameworks", () => {
    const { tree } = routeTree()

    render(<FileTree tree={tree} detectedFramework="fumadocs" onSelect={vi.fn()} />)

    expect(screen.getByText("getting-started")).toBeInTheDocument()
    expect(screen.getByText("page.mdx")).toBeInTheDocument()
  })

  it("does not let search filtering make a multi-child folder newly compactable", () => {
    const { tree, source } = routeTree()
    tree[0].children?.push({
      name: "notes.mdx",
      path: "content/getting-started/notes.mdx",
      sha: "notes-sha",
      type: "file",
    })

    render(
      <FileTree
        tree={tree}
        detectedFramework="next-mdx"
        titleMap={{ [source.path]: "A Better Beginning" }}
        onSelect={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText("Search files..."), { target: { value: "page.mdx" } })

    expect(screen.getByText("getting-started")).toBeInTheDocument()
    expect(screen.getByText("page.mdx")).toBeInTheDocument()
  })
})
