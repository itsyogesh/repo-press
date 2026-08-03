"use client"

import * as React from "react"
import type { FileTreeNode } from "@/lib/github"

interface StudioContextValue {
  owner: string
  repo: string
  branch: string
  baseCommitSha: string
  projectId?: string
  projectAccessToken?: string
  previewEntry?: string
  userId?: string
  selectedFilePath?: string
  contentRoot: string
  tree: FileTreeNode[]
  role: "owner" | "editor" | "viewer"
}

const StudioContext = React.createContext<StudioContextValue | null>(null)

export function StudioProvider({ children, value }: { children: React.ReactNode; value: StudioContextValue }) {
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}

export function useStudio() {
  const context = useOptionalStudio()
  if (!context) {
    throw new Error("useStudio must be used within a StudioProvider")
  }
  return context
}

export function useOptionalStudio() {
  return React.useContext(StudioContext)
}
