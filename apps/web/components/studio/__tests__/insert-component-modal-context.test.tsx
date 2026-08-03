import { act, renderHook } from "@testing-library/react"
import type * as React from "react"
import { describe, expect, it, vi } from "vitest"

describe("Insert component modal context", () => {
  it("blocks context opens and closes an existing modal when editing becomes read-only", async () => {
    const contextModule = await import("../insert-component-modal-context").catch(() => null)
    expect(contextModule).not.toBeNull()
    if (!contextModule) return

    const setOpen = vi.fn()
    let canInsert = true
    const open = true
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <contextModule.InsertComponentModalProvider open={open} canInsert={canInsert} onOpenChange={setOpen}>
        {children}
      </contextModule.InsertComponentModalProvider>
    )
    const { result, rerender } = renderHook(() => contextModule.useInsertComponentModal(), { wrapper })

    expect(result.current?.open).toBe(true)
    canInsert = false
    rerender()
    expect(result.current?.open).toBe(false)
    expect(setOpen).toHaveBeenCalledWith(false)

    setOpen.mockClear()
    act(() => result.current?.setOpen(true))
    expect(setOpen).not.toHaveBeenCalled()
    act(() => result.current?.setOpen(false))
    expect(setOpen).toHaveBeenCalledWith(false)
  })
})
