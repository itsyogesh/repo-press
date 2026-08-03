import { describe, expect, it } from "vitest"
import { resolveStudioPreviewPanelMode } from "../studio-preview-panel-mode"

describe("resolveStudioPreviewPanelMode", () => {
  it.each([
    { adapterLoading: true, adapterError: null, adapterDiagnostics: [] },
    { adapterLoading: false, adapterError: "adapter failed", adapterDiagnostics: ["stale adapter warning"] },
  ])("keeps the generic fallback mounted for adapter state %#", (adapterState) => {
    expect(
      resolveStudioPreviewPanelMode({
        isSelectedDocumentLoading: false,
        selectedFile: true,
        shouldShowProjectDataSkeleton: false,
        ...adapterState,
      }),
    ).toBe("generic")
  })
})
