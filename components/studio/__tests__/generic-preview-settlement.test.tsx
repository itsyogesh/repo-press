import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { PreviewResult } from "@/lib/preview/contracts"
import { buildGenericRenderModel } from "@/lib/preview/generic-render-model"
import { Preview } from "../preview"

function result(source: string, status: PreviewResult["status"]): PreviewResult {
  return {
    fidelity: "generic",
    sessionId: `generic-${source}`,
    snapshotVersion: 1,
    status,
    target: { kind: "safe-fallback", renderModel: buildGenericRenderModel(source) },
    diagnostics: [],
    downgradeReasons: [],
    cache: { hit: false },
  }
}

describe("generic Preview settlement", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("signals compiling from declarative provider status and settles the callback", () => {
    vi.useFakeTimers()
    const onCompilingChange = vi.fn()
    const view = render(
      <Preview previewResult={result("# One", "ready")} frontmatter={{}} onCompilingChange={onCompilingChange} />,
    )

    expect(onCompilingChange).not.toHaveBeenCalled()

    view.rerender(
      <Preview previewResult={result("# One", "building")} frontmatter={{}} onCompilingChange={onCompilingChange} />,
    )
    expect(onCompilingChange.mock.calls).toEqual([[true]])
    expect(view.getByText("Compiling")).toBeTruthy()

    view.rerender(
      <Preview previewResult={result("# Two", "ready")} frontmatter={{}} onCompilingChange={onCompilingChange} />,
    )
    expect(view.getByRole("heading", { name: "Two" })).toBeTruthy()
    expect(view.queryByText("Compiling")).toBeNull()
    expect(onCompilingChange.mock.calls).toEqual([[true]])

    act(() => vi.advanceTimersByTime(299))
    expect(onCompilingChange.mock.calls).toEqual([[true]])

    act(() => vi.advanceTimersByTime(1))
    expect(onCompilingChange.mock.calls).toEqual([[true], [false]])
  })
})
