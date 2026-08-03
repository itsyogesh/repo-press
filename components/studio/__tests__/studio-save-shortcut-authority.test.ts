import { describe, expect, it, vi } from "vitest"
import { handleStudioSaveShortcut } from "../studio-save-shortcut"

describe("Studio save shortcut source authority", () => {
  it("consumes Cmd/Ctrl+S without saving while source authority is unresolved", () => {
    const saveDraft = vi.fn()
    const event = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      cancelable: true,
    })

    expect(handleStudioSaveShortcut(event, false, saveDraft)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it("saves resolved editable sources", () => {
    const saveDraft = vi.fn()
    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      cancelable: true,
    })

    expect(handleStudioSaveShortcut(event, true, saveDraft)).toBe(true)
    expect(saveDraft).toHaveBeenCalledOnce()
  })
})
