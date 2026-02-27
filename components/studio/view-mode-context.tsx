"use client"

import * as React from "react"

export type ViewMode = "editor" | "split"
export type SidebarState = "expanded" | "collapsed"

interface ViewModeContextValue {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  sidebarState: SidebarState
  setSidebarState: (state: SidebarState) => void
  sidebarPanelSize: number
  setSidebarPanelSize: (size: number) => void
  editorPanelSize: number
  setEditorPanelSize: (size: number) => void
  previewPanelSize: number
  setPreviewPanelSize: (size: number) => void
}

const ViewModeContext = React.createContext<ViewModeContextValue | null>(null)
const isValidViewMode = (value: string | null): value is ViewMode => value === "editor" || value === "split"
const isValidSidebarState = (value: string | null): value is SidebarState | "hidden" =>
  value === "expanded" || value === "collapsed" || value === "hidden"

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  // Read initial states from localStorage if available, otherwise defaults
  const [viewMode, setViewModeState] = React.useState<ViewMode>("editor")
  const [sidebarState, setSidebarStateState] = React.useState<SidebarState>("expanded")
  const [sidebarPanelSize, setSidebarPanelSizeState] = React.useState<number>(22)
  const [editorPanelSize, setEditorPanelSizeState] = React.useState<number>(50)
  const [previewPanelSize, setPreviewPanelSizeState] = React.useState<number>(50)

  // Hydrate on mount
  React.useEffect(() => {
    try {
      const storedViewMode = localStorage.getItem("studio:viewMode")
      if (isValidViewMode(storedViewMode)) setViewModeState(storedViewMode)

      const storedSidebarState = localStorage.getItem("studio:sidebarState")
      if (isValidSidebarState(storedSidebarState)) {
        setSidebarStateState(storedSidebarState === "hidden" ? "collapsed" : storedSidebarState)
      } else if (window.matchMedia("(max-width: 767px)").matches) {
        setSidebarStateState("collapsed")
      }

      const storedSidebarSize = localStorage.getItem("studio:sidebarPanelSize")
      if (storedSidebarSize) {
        const size = Number(storedSidebarSize)
        if (size >= 20 && size <= 40) setSidebarPanelSizeState(size)
      }

      const storedEditorSize = localStorage.getItem("studio:editorPanelSize")
      if (storedEditorSize) {
        const size = Number(storedEditorSize)
        if (size >= 30 && size <= 70) setEditorPanelSizeState(size)
      }

      const storedPreviewSize = localStorage.getItem("studio:previewPanelSize")
      if (storedPreviewSize) {
        const size = Number(storedPreviewSize)
        if (size >= 30 && size <= 70) setPreviewPanelSizeState(size)
      }
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

  const setSidebarPanelSize = React.useCallback((size: number) => {
    const clampedSize = Math.max(20, Math.min(40, size))
    setSidebarPanelSizeState(clampedSize)
    try {
      localStorage.setItem("studio:sidebarPanelSize", String(clampedSize))
    } catch {}
  }, [])

  const setEditorPanelSize = React.useCallback((size: number) => {
    const clampedSize = Math.max(30, Math.min(70, size))
    setEditorPanelSizeState(clampedSize)
    try {
      localStorage.setItem("studio:editorPanelSize", String(clampedSize))
    } catch {}
  }, [])

  const setPreviewPanelSize = React.useCallback((size: number) => {
    const clampedSize = Math.max(30, Math.min(70, size))
    setPreviewPanelSizeState(clampedSize)
    try {
      localStorage.setItem("studio:previewPanelSize", String(clampedSize))
    } catch {}
  }, [])

  const value = React.useMemo(
    () => ({
      viewMode,
      setViewMode,
      sidebarState,
      setSidebarState,
      sidebarPanelSize,
      setSidebarPanelSize,
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
      sidebarPanelSize,
      setSidebarPanelSize,
      editorPanelSize,
      setEditorPanelSize,
      previewPanelSize,
      setPreviewPanelSize,
    ],
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
