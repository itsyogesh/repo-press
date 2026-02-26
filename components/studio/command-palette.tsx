"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  FileText,
  Home,
  Keyboard,
  Moon,
  PanelLeft,
  Save,
  Settings,
  Split,
  Sun,
  Maximize,
  Code,
} from "lucide-react"
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
  tree: FileTreeNode[]
  titleMap?: Record<string, string>
  onNavigateToFile: (filePath: string) => void
  onSaveDraft: () => void
}

export function CommandPalette({ tree, titleMap, onNavigateToFile, onSaveDraft }: CommandPaletteProps) {
  const [open, setOpen] = React.useState(false)
  const { owner, repo } = useStudio()
  const { viewMode, setViewMode, sidebarState, setSidebarState } = useViewMode()
  const { theme, setTheme } = useTheme()
  const router = useRouter()

  // Global Cmd+K shortcut
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Flatten file tree for search
  const flatFiles = React.useMemo(() => {
    const result: { path: string; name: string; title?: string }[] = []
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

  const handleSelect = (action: string) => {
    setOpen(false)

    switch (action) {
      case "save":
        onSaveDraft()
        break
      case "toggle-preview":
        setViewMode(viewMode === "split" ? "wysiwyg" : "split")
        break
      case "toggle-source":
        setViewMode(viewMode === "source" ? "wysiwyg" : "source")
        break
      case "toggle-theme":
        setTheme(theme === "dark" ? "light" : "dark")
        break
      case "toggle-sidebar":
        setSidebarState(sidebarState === "hidden" ? "expanded" : "hidden")
        break
      case "zen-mode":
        setViewMode(viewMode === "zen" ? "wysiwyg" : "zen")
        break
      case "dashboard":
        router.push(`/dashboard/${owner}/${repo}`)
        break
      case "settings":
        router.push(`/dashboard/${owner}/${repo}/settings`)
        break
      default:
        // File navigation
        if (action.startsWith("file:")) {
          onNavigateToFile(action.replace("file:", ""))
        }
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command Palette" description="Search commands and files">
      <CommandInput placeholder="Search commands and files..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Files">
          {flatFiles.slice(0, 10).map((file) => (
            <CommandItem
              key={file.path}
              value={`${file.title || ""} ${file.name} ${file.path}`}
              onSelect={() => handleSelect(`file:${file.path}`)}
            >
              <FileText className="h-4 w-4 text-studio-fg-muted" />
              <div className="flex flex-col">
                <span className="text-sm">{file.title || file.name}</span>
                {file.title && (
                  <span className="text-xs text-studio-fg-muted">{file.path}</span>
                )}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => handleSelect("save")}>
            <Save className="h-4 w-4" />
            Save draft
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("toggle-preview")}>
            <Split className="h-4 w-4" />
            Toggle preview
            <CommandShortcut>⌘⇧P</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("toggle-source")}>
            <Code className="h-4 w-4" />
            Toggle source mode
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
          <CommandItem onSelect={() => handleSelect("zen-mode")}>
            <Maximize className="h-4 w-4" />
            Zen mode
            <CommandShortcut>⌘\</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => handleSelect("dashboard")}>
            <Home className="h-4 w-4" />
            Go to Dashboard
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("settings")}>
            <Settings className="h-4 w-4" />
            Project Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
