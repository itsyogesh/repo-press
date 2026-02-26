"use client"

import * as React from "react"

export type ViewMode = "wysiwyg" | "source" | "split" | "zen"
export type SidebarState = "expanded" | "collapsed" | "hidden"

interface ViewModeContextValue {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  sidebarState: SidebarState
  setSidebarState: (state: SidebarState) => void
  editorPanelSize: number
  setEditorPanelSize: (size: number) => void
  previewPanelSize: number
  setPreviewPanelSize: (size: number) => void
}

const ViewModeContext = React.createContext<ViewModeContextValue | null>(null)

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  // Read initial states from localStorage if available, otherwise defaults
  const [viewMode, setViewModeState] = React.useState<ViewMode>("wysiwyg")
  const [sidebarState, setSidebarStateState] = React.useState<SidebarState>("expanded")
  const [editorPanelSize, setEditorPanelSizeState] = React.useState<number>(50)
  const [previewPanelSize, setPreviewPanelSizeState] = React.useState<number>(50)

  // Hydrate on mount
  React.useEffect(() => {
    try {
      const storedViewMode = localStorage.getItem("studio:viewMode") as ViewMode
      if (storedViewMode) setViewModeState(storedViewMode)

      const storedSidebarState = localStorage.getItem("studio:sidebarState") as SidebarState
      if (storedSidebarState) setSidebarStateState(storedSidebarState)

      const storedEditorSize = localStorage.getItem("studio:editorPanelSize")
      if (storedEditorSize) setEditorPanelSizeState(Number(storedEditorSize))

      const storedPreviewSize = localStorage.getItem("studio:previewPanelSize")
      if (storedPreviewSize) setPreviewPanelSizeState(Number(storedPreviewSize))
    } catch (e) {
      console.error("Failed to read studio view state from localStorage", e)
    }
  }, [])

  // Wrappers to update state and localStorage
  const setViewMode = React.useCallback((mode: ViewMode) => {
    setViewModeState(mode)
    try {
      localStorage.setItem("studio:viewMode", mode)
    } catch {}
  }, [])

  const setSidebarState = React.useCallback((state: SidebarState) => {
    setSidebarStateState(state)
    try {
      localStorage.setItem("studio:sidebarState", state)
    } catch {}
  }, [])

  const setEditorPanelSize = React.useCallback((size: number) => {
    setEditorPanelSizeState(size)
    try {
      localStorage.setItem("studio:editorPanelSize", String(size))
    } catch {}
  }, [])

  const setPreviewPanelSize = React.useCallback((size: number) => {
    setPreviewPanelSizeState(size)
    try {
      localStorage.setItem("studio:previewPanelSize", String(size))
    } catch {}
  }, [])

  const value = React.useMemo(
    () => ({
      viewMode,
      setViewMode,
      sidebarState,
      setSidebarState,
      editorPanelSize,
      setEditorPanelSize,
      previewPanelSize,
      setPreviewPanelSize,
    }),
    [
      viewMode,
      setViewMode,
      sidebarState,
      setSidebarState,
      editorPanelSize,
      setEditorPanelSize,
      previewPanelSize,
      setPreviewPanelSize,
    ]
  )

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>
}

export function useViewMode() {
  const context = React.useContext(ViewModeContext)
  if (!context) {
    throw new Error("useViewMode must be used within a ViewModeProvider")
  }
  return context
}
