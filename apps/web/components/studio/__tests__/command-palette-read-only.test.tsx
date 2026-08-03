import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CommandPalette } from "../command-palette"

const { insertModal } = vi.hoisted(() => ({
  insertModal: { open: false, canInsert: false, setOpen: vi.fn() },
}))

vi.mock("../insert-component-modal-context", () => ({ useInsertComponentModal: () => insertModal }))
vi.mock("../studio-context", () => ({
  useStudio: () => ({ owner: "acme", repo: "docs", branch: "main", projectId: "project_1" }),
}))
vi.mock("../view-mode-context", () => ({
  useViewMode: () => ({
    viewMode: "editor",
    setViewMode: vi.fn(),
    sidebarState: "expanded",
    setSidebarState: vi.fn(),
  }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }))
vi.mock("@/components/ui/command", () => ({
  CommandDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  CommandInput: () => null,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandSeparator: () => <hr />,
  CommandShortcut: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  CommandItem: ({ children, disabled, onSelect, "aria-label": ariaLabel }: any) => (
    <button type="button" disabled={disabled} aria-label={ariaLabel} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}))

afterEach(cleanup)

describe("CommandPalette read-only insertion", () => {
  it("disables the Insert component command and does not open its modal", () => {
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        tree={[]}
        onNavigateToFile={vi.fn()}
        onSaveDraft={vi.fn()}
        canInsertComponent={false}
      />,
    )

    const insertCommand = screen.getByRole("button", { name: "Insert unavailable for read-only source" })
    expect(insertCommand).toBeDisabled()
    expect(insertCommand).toHaveAttribute("aria-label", "Insert unavailable for read-only source")
    fireEvent.click(insertCommand)
    expect(insertModal.setOpen).not.toHaveBeenCalled()
  })

  it("does not run Save draft while source authority is unresolved", () => {
    const onSaveDraft = vi.fn()
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        tree={[]}
        onNavigateToFile={vi.fn()}
        onSaveDraft={onSaveDraft}
        canSaveDraft={false}
      />,
    )

    const saveCommand = screen.getByRole("button", { name: /Save draft/i })
    expect(saveCommand).toBeDisabled()
    fireEvent.click(saveCommand)
    expect(onSaveDraft).not.toHaveBeenCalled()
  })
})
