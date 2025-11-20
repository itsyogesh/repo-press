"use client"

import * as React from "react"
import { File, Folder } from "lucide-react"
import { cn } from "@/lib/utils"
import type { GitHubFile } from "@/lib/github"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface FileTreeProps {
  files: GitHubFile[]
  onSelect: (file: GitHubFile) => void
  selectedPath?: string
  currentPath: string
}

export function FileTree({ files, onSelect, selectedPath, currentPath }: FileTreeProps) {
  // Group files by directory structure
  // For simplicity in this version, we'll just show a flat list or simple grouping
  // But the requirement is a "File Browser".
  // Since the API returns a flat list for a specific path, we might need to fetch recursively or just show the current level.
  // However, the "Studio" usually implies a full tree.
  // Given the GitHub API limitations (fetching tree recursively can be large),
  // we'll implement a simple explorer that can navigate folders.

  // Actually, for a true "VS Code" like experience, we need a recursive tree.
  // But let's start with the provided flat list and handle navigation.

  // Wait, the `files` prop comes from `getRepoContents`.
  // If we want a full tree, we need `git/trees` API with recursive=1.
  // For now, let's assume `files` is the current directory content and we handle navigation.

  // To make it "Studio-like", we should probably fetch the whole tree if possible,
  // or just handle the current directory and allow navigating up/down.

  // Let's stick to the current directory for now to match the existing logic,
  // but style it as a sidebar.

  const sortedFiles = React.useMemo(() => {
    return [...files].sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name)
      }
      return a.type === "dir" ? -1 : 1
    })
  }, [files])

  const parentPath = currentPath.split("/").slice(0, -1).join("/")
  const showUp = currentPath !== "" && !files.some((f) => f.path === parentPath) // Only show if not at root

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">Explorer</div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {showUp && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 px-2 h-8 font-normal text-muted-foreground"
              onClick={() =>
                onSelect({
                  name: "..",
                  path: parentPath,
                  type: "dir",
                  sha: "",
                  download_url: null,
                })
              }
            >
              <Folder className="h-4 w-4 shrink-0" />
              <span className="truncate text-sm">..</span>
            </Button>
          )}

          {sortedFiles.map((file) => (
            <FileTreeItem key={file.path} file={file} isSelected={selectedPath === file.path} onSelect={onSelect} />
          ))}
          {sortedFiles.length === 0 && !showUp && (
            <div className="text-xs text-muted-foreground p-2 text-center">No files found</div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface FileTreeItemProps {
  file: GitHubFile
  isSelected: boolean
  onSelect: (file: GitHubFile) => void
}

function FileTreeItem({ file, isSelected, onSelect }: FileTreeItemProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start gap-2 px-2 h-8 font-normal",
        isSelected && "bg-accent text-accent-foreground",
      )}
      onClick={() => onSelect(file)}
    >
      {file.type === "dir" ? (
        <Folder className="h-4 w-4 shrink-0 text-blue-500" />
      ) : (
        <File className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate text-sm">{file.name}</span>
    </Button>
  )
}
