"use client"

import * as React from "react"
import type { RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"

interface StudioAdapterContextValue {
  adapter: RepoPressPreviewAdapter | null
  adapterLoading: boolean
  adapterError: string | null
  adapterDiagnostics: string[]
  components: Record<string, any> | undefined
  /** Adapter components for the insert picker, filtered to the current contentRoot via componentsByContext. Falls back to standardComponents (universal safe set) when no context split is declared - intentionally excludes adapter-specific docs components from appearing in non-docs insert pickers. */
  resolvedComponents: Record<string, any> | undefined
  detectedFramework?: string
}

const StudioAdapterContext = React.createContext<StudioAdapterContextValue | null>(null)

export function StudioAdapterProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: StudioAdapterContextValue
}) {
  return <StudioAdapterContext.Provider value={value}>{children}</StudioAdapterContext.Provider>
}

export function useStudioAdapter() {
  const context = React.useContext(StudioAdapterContext)
  if (!context) {
    throw new Error("useStudioAdapter must be used within a StudioAdapterProvider")
  }
  return context
}
