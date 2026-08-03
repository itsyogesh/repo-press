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
  it("creates at the content root without repeating route-document folders in a menu", () => {
    const articleNames = ["getting-started", "winter-activities", "holiday-gift-guide"]
    const tree: OverlayTreeNode[] = articleNames.map((name) => ({
      name,
      path: `content/${name}`,
      sha: `${name}-dir-sha`,
      type: "dir",
      children: [
        {
          name: "page.mdx",
          path: `content/${name}/page.mdx`,
          sha: `${name}-leaf-sha`,
          type: "file",
        },
      ],
    }))
    const onCreateFile = vi.fn()

    render(<FileTree tree={tree} detectedFramework="next-mdx" onSelect={vi.fn()} onCreateFile={onCreateFile} />)

    const createButton = screen.getByRole("button", { name: "New file" })
    expect(screen.getAllByRole("button", { name: "New file" })).toHaveLength(1)

    fireEvent.click(createButton)

    expect(onCreateFile).toHaveBeenCalledOnce()
    expect(onCreateFile).toHaveBeenCalledWith("")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    for (const articleName of articleNames) {
      expect(screen.queryByRole("menuitem", { name: new RegExp(articleName, "i") })).not.toBeInTheDocument()
    }
  })

  it("renders one accessible article row and selects the real leaf by click and keyboard", () => {
    const { tree, source } = routeTree()
    const onSelect = vi.fn()
    const onMoveFile = vi.fn()

    render(
      <FileTree
        tree={tree}
        detectedFramework="next-mdx"
        titleMap={{ [source.path]: "A Better Beginning" }}
        onSelect={onSelect}
        onMoveFile={onMoveFile}
      />,
    )

    const row = screen.getByRole("button", { name: /A Better Beginning getting-started/i })
    expect(screen.getAllByRole("button")).toEqual([row])
    expect(screen.queryByText("page.mdx")).not.toBeInTheDocument()
    expect(row).toHaveAttribute("title", "A Better Beginning")
    expect(row).not.toHaveAttribute("aria-expanded")
    expect(row).not.toHaveAttribute("aria-roledescription", "draggable")
    expect(row).not.toHaveAttribute("aria-describedby", "studio-file-tree-dnd")

    fireEvent.pointerDown(row, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(row, { clientX: 30, clientY: 30 })
    fireEvent.pointerUp(row)
    expect(onMoveFile).not.toHaveBeenCalled()

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
    expect(screen.getByRole("button", { name: /Getting Started getting-started New/i })).toBeInTheDocument()

    delete source.isNew
    rerender(
      <FileTree tree={tree} detectedFramework="next-mdx" onSelect={vi.fn()} dirtyPaths={new Set([source.path])} />,
    )
    expect(screen.getByText("EDITED")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Getting Started getting-started Edited/i })).toBeInTheDocument()
  })

  it("deletes the real leaf and omits route-bundle rename interactions", async () => {
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

    fireEvent.contextMenu(row)
    expect(await screen.findByRole("menuitem", { name: "Open" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /Rename/ })).not.toBeInTheDocument()

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

  it("finds a compact route by its visible humanized fallback label", () => {
    const { tree } = routeTree()

    render(<FileTree tree={tree} detectedFramework="next-mdx" onSelect={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText("Search files..."), { target: { value: "Getting Started" } })

    expect(screen.getByRole("button", { name: /Getting Started getting-started/i })).toBeInTheDocument()
  })

  it("keeps ordinary folders expandable and ordinary files draggable and renameable", async () => {
    const onMoveFile = vi.fn()
    const onRenameFile = vi.fn()
    const tree: OverlayTreeNode[] = [
      {
        name: "guides",
        path: "content/guides",
        sha: "guides-sha",
        type: "dir",
        children: [
          {
            name: "notes.mdx",
            path: "content/guides/notes.mdx",
            sha: "notes-sha",
            type: "file",
          },
        ],
      },
    ]

    render(
      <FileTree
        tree={tree}
        detectedFramework="next-mdx"
        onSelect={vi.fn()}
        onMoveFile={onMoveFile}
        onRenameFile={onRenameFile}
      />,
    )

    const folder = screen.getByRole("button", { name: "guides" })
    expect(folder.querySelector(".lucide-chevron-down")).toBeInTheDocument()

    const fileButton = document.querySelector<HTMLButtonElement>('button[title="notes.mdx"]')
    expect(fileButton).not.toBeNull()
    const draggable = fileButton?.closest('[aria-roledescription="draggable"]')
    expect(draggable).toHaveAttribute("role", "button")
    expect(draggable).toHaveAttribute("tabindex", "0")

    fireEvent.contextMenu(fileButton!)
    expect(await screen.findByRole("menuitem", { name: /Rename/ })).toBeInTheDocument()
    expect(onMoveFile).not.toHaveBeenCalled()
  })
})
