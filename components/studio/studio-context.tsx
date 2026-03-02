import * as React from "react"
import type { FileTreeNode } from "@/lib/github"
import type { RepoPressPreviewAdapter } from "@/lib/repopress/evaluate-adapter"

interface StudioContextValue {
  owner: string
  repo: string
  branch: string
  projectId?: string
  contentRoot: string
  tree: FileTreeNode[]
  // Dynamic Adapter state
  adapter: RepoPressPreviewAdapter | null
  adapterLoading: boolean
  adapterError: string | null
  adapterDiagnostics: string[]
  components: Record<string, any> | undefined
}

const StudioContext = React.createContext<StudioContextValue | null>(null)

export function StudioProvider({ children, value }: { children: React.ReactNode; value: StudioContextValue }) {
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}

export function useStudio() {
  const context = React.useContext(StudioContext)
  if (!context) {
    throw new Error("useStudio must be used within a StudioProvider")
  }
  return context
}
