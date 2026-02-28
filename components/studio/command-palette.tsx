"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { FileText, Home, Moon, PanelLeft, Save, Split, Sun, Code, History } from "lucide-react"
import { useTheme } from "next-themes"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import type { FileTreeNode } from "@/lib/github"

import { useStudio } from "./studio-context"
import { useViewMode } from "./view-mode-context"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tree: FileTreeNode[]
  titleMap?: Record<string, string>
  recentFiles?: string[]
  onNavigateToFile: (filePath: string) => void
  onSaveDraft: () => void
}

type FlatFile = { path: string; name: string; title?: string }

function getFileScore(file: FlatFile, query: string): number {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 1

  const filePath = file.path.toLowerCase()
  const fileName = file.name.toLowerCase()
  const fileTitle = file.title?.toLowerCase() ?? ""
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)

  if (tokens.length === 0) return 1

  const searchableText = `${fileTitle} ${fileName} ${filePath}`
  const allTokensMatch = tokens.every((token) => searchableText.includes(token))
  if (!allTokensMatch) return 0

  let score = 0

  if (filePath === normalizedQuery) score += 200
  if (fileName === normalizedQuery) score += 180
  if (fileTitle && fileTitle === normalizedQuery) score += 220

  if (filePath.startsWith(normalizedQuery)) score += 120
  if (fileName.startsWith(normalizedQuery)) score += 140
  if (fileTitle.startsWith(normalizedQuery)) score += 160

  if (filePath.includes(normalizedQuery)) score += 60
  if (fileName.includes(normalizedQuery)) score += 80
  if (fileTitle.includes(normalizedQuery)) score += 90

  for (const token of tokens) {
    if (fileTitle.includes(token)) score += 16
    if (fileName.includes(token)) score += 10
    if (filePath.includes(token)) score += 6
  }

  return score
}

export function CommandPalette({
  open,
  onOpenChange,
  tree,
  titleMap,
  recentFiles = [],
  onNavigateToFile,
  onSaveDraft,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState("")
  const { owner, repo } = useStudio()
  const { viewMode, setViewMode, sidebarState, setSidebarState } = useViewMode()
  const { theme, setTheme } = useTheme()
  const router = useRouter()

  React.useEffect(() => {
    if (!open) {
      setQuery("")
    }
  }, [open])

  const flatFiles = React.useMemo(() => {
    const result: FlatFile[] = []
    const flatten = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.type === "file") {
          result.push({
            path: node.path,
            name: node.name,
            title: titleMap?.[node.path],
          })
        }
        if (node.children) {
          flatten(node.children)
        }
      }
    }
    flatten(tree)
    return result
  }, [tree, titleMap])

  const fileResults = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return flatFiles
      .map((file) => ({ file, score: getFileScore(file, normalizedQuery) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => (b.score === a.score ? a.file.path.localeCompare(b.file.path) : b.score - a.score))
      .slice(0, 40)
      .map((entry) => entry.file)
  }, [flatFiles, query])

  const recentFileResults = React.useMemo(() => {
    if (recentFiles.length === 0) return []
    const normalizedQuery = query.trim().toLowerCase()
    const byPath = new Map(flatFiles.map((file) => [file.path, file]))

    return recentFiles
      .map((path) => {
        const fallbackName = path.split("/").pop() || path
        const file = byPath.get(path) || { path, name: fallbackName, title: titleMap?.[path] }
        return { file, score: getFileScore(file, normalizedQuery) }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => (b.score === a.score ? a.file.path.localeCompare(b.file.path) : b.score - a.score))
      .slice(0, 8)
      .map((entry) => entry.file)
  }, [flatFiles, query, recentFiles, titleMap])

  const recentPathSet = React.useMemo(() => new Set(recentFileResults.map((file) => file.path)), [recentFileResults])
  const remainingFileResults = React.useMemo(
    () => fileResults.filter((file) => !recentPathSet.has(file.path)),
    [fileResults, recentPathSet],
  )

  const handleSelect = (action: string) => {
    if (action.startsWith("file:")) {
      onNavigateToFile(action.replace("file:", ""))
      onOpenChange(false)
      return
    }

    onOpenChange(false)

    switch (action) {
      case "save":
        onSaveDraft()
        break
      case "show-split":
        setViewMode(viewMode === "split" ? "editor" : "split")
        break
      case "show-editor":
        setViewMode("editor")
        break
      case "toggle-theme":
        setTheme(theme === "dark" ? "light" : "dark")
        break
      case "toggle-sidebar":
        setSidebarState(sidebarState === "expanded" ? "collapsed" : "expanded")
        break
      case "dashboard":
        router.push("/dashboard")
        break
      case "history":
        router.push(`/dashboard/${owner}/${repo}/history`)
        break
      default:
        break
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Search files, actions, and navigation"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search files, actions, and pages..."
      />
      <CommandList>
        <CommandEmpty>{query.trim() ? "No results found." : "Type to search..."}</CommandEmpty>

        {recentFileResults.length > 0 && (
          <CommandGroup heading="Recent">
            {recentFileResults.map((file) => (
              <CommandItem
                key={`recent:${file.path}`}
                value={`file:${file.path}`}
                keywords={[file.title || "", file.name, file.path]}
                className="items-start"
                onSelect={() => {
                  handleSelect(`file:${file.path}`)
                }}
                onClick={() => handleSelect(`file:${file.path}`)}
              >
                <History className="h-4 w-4 text-studio-fg-muted" />
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm">{file.title || file.name}</span>
                  <span className="text-xs text-studio-fg-muted">{file.path}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {remainingFileResults.length > 0 && (
          <CommandGroup heading="Files">
            {remainingFileResults.map((file) => (
              <CommandItem
                key={file.path}
                value={`file:${file.path}`}
                keywords={[file.title || "", file.name, file.path]}
                className="items-start"
                onSelect={() => {
                  handleSelect(`file:${file.path}`)
                }}
                onClick={() => handleSelect(`file:${file.path}`)}
              >
                <FileText className="h-4 w-4 text-studio-fg-muted" />
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm">{file.title || file.name}</span>
                  {file.title && <span className="text-xs text-studio-fg-muted">{file.path}</span>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => handleSelect("save")}>
            <Save className="h-4 w-4" />
            Save draft
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("show-split")}>
            <Split className="h-4 w-4" />
            Toggle split preview
            <CommandShortcut>⌘⇧P</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("show-editor")}>
            <Code className="h-4 w-4" />
            Switch to editor only
            <CommandShortcut>⌘⇧S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("toggle-theme")}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Toggle theme
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("toggle-sidebar")}>
            <PanelLeft className="h-4 w-4" />
            Toggle sidebar
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => handleSelect("dashboard")}>
            <Home className="h-4 w-4" />
            Go to Dashboard
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("history")}>
            <History className="h-4 w-4" />
            Project History
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
