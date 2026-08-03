import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { buildAuthoringCatalog } from "@/lib/studio/authoring-catalog"
import { InsertJsxButton } from "../insert-jsx-button"
import { createStudioAdapterState, StudioAdapterProvider } from "../studio-adapter-context"

const { insertJsx, contextValue } = vi.hoisted(() => ({
  insertJsx: vi.fn(),
  contextValue: null as null | { open: boolean; canInsert: boolean; setOpen: (open: boolean) => void },
}))

vi.mock("@mdxeditor/editor", () => ({
  insertJsx$: Symbol("insertJsx"),
  usePublisher: () => insertJsx,
}))
vi.mock("../insert-component-modal-context", () => ({ useInsertComponentModal: () => contextValue }))
vi.mock("../component-insert-modal", () => ({
  ComponentInsertModal: ({ onInsert }: any) => (
    <button
      type="button"
      onClick={() =>
        onInsert(
          "<Callout />",
          { mdxName: "Callout", displayName: "Callout", props: [], hasChildren: false },
          { type: "component", name: "Callout", props: {}, children: [] },
        )
      }
    >
      Force modal insert
    </button>
  ),
}))

describe("InsertJsxButton read-only boundary", () => {
  it("disables its native trigger and refuses a stale modal insertion", () => {
    const adapter = createStudioAdapterState({
      authoringCatalog: buildAuthoringCatalog({ metadata: { Callout: { props: [], hasChildren: false } } }),
      nativeComponentNames: [],
    })

    render(
      <TooltipProvider>
        <StudioAdapterProvider value={adapter}>
          <InsertJsxButton owner="acme" repo="docs" branch="main" readOnly />
        </StudioAdapterProvider>
      </TooltipProvider>,
    )

    const trigger = screen.getByRole("button", { name: "Insert unavailable for read-only source" })
    expect(trigger).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Force modal insert" }))
    expect(insertJsx).not.toHaveBeenCalled()
  })
})
