import { describe, expect, it } from "vitest"
import { shouldResetEditorBoundary } from "../editor-error-boundary-utils"

describe("shouldResetEditorBoundary", () => {
  it("returns false when boundary is not in error state", () => {
    expect(shouldResetEditorBoundary(false, "a.mdx", "b.mdx")).toBe(false)
  })

  it("returns false when reset key has not changed", () => {
    expect(shouldResetEditorBoundary(true, "a.mdx", "a.mdx")).toBe(false)
  })

  it("returns true when in error state and reset key changes", () => {
    expect(shouldResetEditorBoundary(true, "a.mdx", "b.mdx")).toBe(true)
  })
})
