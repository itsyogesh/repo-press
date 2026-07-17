import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PreviewStatus } from "@/components/mdx-runtime/PreviewStatus"

describe("PreviewStatus fidelity guidance", () => {
  afterEach(cleanup)

  it("describes diagnostics without making a preview adapter authoritative", () => {
    render(<PreviewStatus isCompiling={false} warnings={["Unsupported component downgraded the preview"]} />)

    fireEvent.click(screen.getByRole("button"))

    expect(screen.getByText(/current snapshot and preview fidelity/i)).toBeTruthy()
    expect(screen.queryByText(/mdx-preview\.tsx/i)).toBeNull()
  })

  it("reports only that the current snapshot has no diagnostics", () => {
    render(<PreviewStatus isCompiling={false} warnings={[]} />)

    fireEvent.click(screen.getByRole("button"))

    expect(screen.getByText(/no diagnostics for the current preview snapshot/i)).toBeTruthy()
    expect(screen.queryByText(/fully optimized/i)).toBeNull()
    expect(screen.queryByText(/everything looks perfect/i)).toBeNull()
  })
})
