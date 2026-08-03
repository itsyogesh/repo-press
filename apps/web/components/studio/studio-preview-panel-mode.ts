export type StudioPreviewPanelMode = "loading" | "empty" | "generic"

export function resolveStudioPreviewPanelMode(inputs: {
  isSelectedDocumentLoading: boolean
  selectedFile: boolean
  shouldShowProjectDataSkeleton: boolean
  adapterLoading: boolean
  adapterError: string | null
  adapterDiagnostics: string[]
}): StudioPreviewPanelMode {
  if (inputs.isSelectedDocumentLoading || (!inputs.selectedFile && inputs.shouldShowProjectDataSkeleton)) {
    return "loading"
  }
  if (!inputs.selectedFile) return "empty"
  return "generic"
}
