"use client"

import { Code, FileText, History, Home, Moon, PanelLeft, Plus, Save, Search, Split, Sun } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
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
import { buildHistoryHref } from "@/lib/studio/history-link"
import { cn } from "@/lib/utils"
import { useInsertComponentModal } from "./insert-component-modal-context"
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
  canSaveDraft?: boolean
  canInsertComponent?: boolean
}

type FlatFile = { path: string; name: string; title?: string }

function PaletteIconShell({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "accent" }) {
  return (
    <div
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md",
        tone === "accent"
          ? "border border-studio-accent/20 bg-studio-accent-muted/60 text-studio-accent"
          : "text-studio-fg-muted",
      )}
    >
      {children}
    </div>
  )
}

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
  canSaveDraft = true,
  canInsertComponent = true,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState("")
  const { owner, repo, branch, projectId } = useStudio()
  const { viewMode, setViewMode, sidebarState, setSidebarState } = useViewMode()
  const insertComponentModal = useInsertComponentModal()
  const canInsert = canInsertComponent && (insertComponentModal?.canInsert ?? true)
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
        if (canSaveDraft) onSaveDraft()
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
        router.push(buildHistoryHref({ owner, repo, branch, projectId }))
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
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search files, actions, and pages..." />
      <CommandList className="max-h-[30rem] px-3 pb-3">
        <CommandEmpty>
          <div className="space-y-2 py-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-lg border border-studio-border/70 bg-studio-canvas-inset/40">
              <Search className="h-5 w-5 text-studio-fg-muted" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-studio-fg">
                {query.trim() ? "No results found" : "Start typing to search"}
              </p>
              <p>{query.trim() ? "Try a file path, title, or command." : "Search files, commands, and navigation."}</p>
            </div>
          </div>
        </CommandEmpty>

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
                <PaletteIconShell>
                  <History className="h-4 w-4" />
                </PaletteIconShell>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-studio-fg">{file.title || file.name}</span>
                    <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">
                      recent
                    </Badge>
                  </div>
                  <span className="truncate text-xs text-studio-fg-muted">{file.path}</span>
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
                <PaletteIconShell>
                  <FileText className="h-4 w-4" />
                </PaletteIconShell>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-studio-fg">{file.title || file.name}</span>
                  </div>
                  <span className="truncate text-xs text-studio-fg-muted">{file.path}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Actions">
          {insertComponentModal && (
            <CommandItem
              disabled={!canInsert}
              aria-label={canInsert ? "Insert component" : "Insert unavailable for read-only source"}
              onSelect={() => {
                if (!canInsert) return
                insertComponentModal.setOpen(true)
                onOpenChange(false)
              }}
            >
              <PaletteIconShell tone="accent">
                <Plus className="h-4 w-4" />
              </PaletteIconShell>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-studio-fg">Insert component</span>
                <span className="text-xs text-studio-fg-muted">Open the JSX component browser.</span>
              </div>
              <CommandShortcut>⌘J</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem disabled={!canSaveDraft} onSelect={() => handleSelect("save")}>
            <PaletteIconShell tone="accent">
              <Save className="h-4 w-4" />
            </PaletteIconShell>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-studio-fg">Save draft</span>
              <span className="text-xs text-studio-fg-muted">Persist your current changes.</span>
            </div>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("show-split")}>
            <PaletteIconShell>
              <Split className="h-4 w-4" />
            </PaletteIconShell>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-studio-fg">Toggle split preview</span>
              <span className="text-xs text-studio-fg-muted">Show or hide the live preview pane.</span>
            </div>
            <CommandShortcut>⌘⇧P</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("show-editor")}>
            <PaletteIconShell>
              <Code className="h-4 w-4" />
            </PaletteIconShell>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-studio-fg">Switch to editor only</span>
              <span className="text-xs text-studio-fg-muted">Focus on writing without the preview pane.</span>
            </div>
            <CommandShortcut>⌘⇧S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("toggle-theme")}>
            <PaletteIconShell>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </PaletteIconShell>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-studio-fg">Toggle theme</span>
              <span className="text-xs text-studio-fg-muted">Switch between dark and light studio chrome.</span>
            </div>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("toggle-sidebar")}>
            <PaletteIconShell>
              <PanelLeft className="h-4 w-4" />
            </PaletteIconShell>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-studio-fg">Toggle sidebar</span>
              <span className="text-xs text-studio-fg-muted">Collapse to the rail or reopen the explorer.</span>
            </div>
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => handleSelect("dashboard")}>
            <PaletteIconShell>
              <Home className="h-4 w-4" />
            </PaletteIconShell>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-studio-fg">Go to Dashboard</span>
              <span className="text-xs text-studio-fg-muted">Return to the main workspace overview.</span>
            </div>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("history")}>
            <PaletteIconShell>
              <History className="h-4 w-4" />
            </PaletteIconShell>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-studio-fg">Project history</span>
              <span className="text-xs text-studio-fg-muted">Review recent publish lanes and activity.</span>
            </div>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center gap-4 border-t border-border/60 px-4 py-2">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="font-mono">↑↓</span> navigate
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="font-mono">↵</span> open
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="font-mono">esc</span> close
        </span>
      </div>
    </CommandDialog>
  )
}
