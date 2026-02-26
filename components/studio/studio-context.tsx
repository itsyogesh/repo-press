import * as React from "react"
import type { FileTreeNode } from "@/lib/github"

interface StudioContextValue {
  owner: string
  repo: string
  branch: string
  projectId?: string
  contentRoot: string
  tree: FileTreeNode[]
}

const StudioContext = React.createContext<StudioContextValue | null>(null)

export function StudioProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: StudioContextValue
}) {
  return (
    <StudioContext.Provider value={value}>
      {children}
    </StudioContext.Provider>
  )
}

export function useStudio() {
  const context = React.useContext(StudioContext)
  if (!context) {
    throw new Error("useStudio must be used within a StudioProvider")
  }
  return context
}
