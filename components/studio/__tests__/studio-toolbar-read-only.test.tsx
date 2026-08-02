import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { StudioToolbar } from "../studio-toolbar"

vi.mock("@mdxeditor/editor", () => ({
  DiffSourceToggleWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BlockTypeSelect: () => null,
  BoldItalicUnderlineToggles: () => null,
  CodeToggle: () => null,
  CreateLink: () => null,
  InsertCodeBlock: () => null,
  InsertImage: () => null,
  InsertTable: () => null,
  InsertThematicBreak: () => null,
  ListsToggle: () => null,
  Separator: () => null,
  StrikeThroughSupSubToggles: () => null,
  UndoRedo: () => null,
}))
vi.mock("../insert-jsx-button", () => ({
  InsertJsxButton: ({ readOnly }: { readOnly?: boolean }) => (
    <output aria-label="Toolbar insert state">{readOnly ? "read-only" : "editable"}</output>
  ),
}))

describe("StudioToolbar read-only state", () => {
  it("threads read-only state to the native component insertion button", () => {
    render(<StudioToolbar owner="acme" repo="docs" branch="main" readOnly />)
    expect(screen.getByRole("status", { name: "Toolbar insert state" })).toHaveTextContent("read-only")
  })
})
