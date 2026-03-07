"use client"

import * as React from "react"
import type { RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"

interface StudioAdapterContextValue {
  adapter: RepoPressPreviewAdapter | null
  adapterLoading: boolean
  adapterError: string | null
  adapterDiagnostics: string[]
  components: Record<string, any> | undefined
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
