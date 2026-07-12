import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Preview } from "../preview"

describe("generic Preview settlement", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("signals compiling through the debounced model update and settled layout", () => {
    vi.useFakeTimers()
    const onCompilingChange = vi.fn()
    const view = render(<Preview content="# One" frontmatter={{}} onCompilingChange={onCompilingChange} />)

    expect(onCompilingChange).not.toHaveBeenCalled()

    view.rerender(<Preview content="# Two" frontmatter={{}} onCompilingChange={onCompilingChange} />)
    expect(onCompilingChange.mock.calls).toEqual([[true]])
    expect(view.getByText("Compiling")).toBeTruthy()

    act(() => vi.advanceTimersByTime(300))
    expect(view.getByRole("heading", { name: "Two" })).toBeTruthy()
    expect(view.queryByText("Compiling")).toBeNull()
    expect(onCompilingChange.mock.calls).toEqual([[true]])

    act(() => vi.advanceTimersByTime(299))
    expect(onCompilingChange.mock.calls).toEqual([[true]])

    act(() => vi.advanceTimersByTime(1))
    expect(onCompilingChange.mock.calls).toEqual([[true], [false]])
  })
})
