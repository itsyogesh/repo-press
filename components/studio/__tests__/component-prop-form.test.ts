import { describe, expect, it } from "vitest"
import { shouldShowVideoPreview } from "../component-prop-form"

describe("shouldShowVideoPreview", () => {
  it("enables preview for DocsVideo src when only the component name is available", () => {
    expect(shouldShowVideoPreview("DocsVideo", "src")).toBe(true)
  })

  it("does not enable preview for non-src props or unrelated components", () => {
    expect(shouldShowVideoPreview("DocsVideo", "title")).toBe(false)
    expect(shouldShowVideoPreview("DocsImage", "src")).toBe(false)
  })
})
