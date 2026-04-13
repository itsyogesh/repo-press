"use client"

import { ChevronLeft, File, Folder, FolderOpen } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { GitHubFile } from "@/lib/github"
import { cn } from "@/lib/utils"

interface FileBrowserProps {
  files: GitHubFile[]
  currentPath?: string
  owner: string
  repo: string
  branch?: string
  basePath?: string
}

export function FileBrowser({ files, currentPath = "", owner, repo, branch = "main", basePath }: FileBrowserProps) {
  const resolvedBasePath = basePath || `/dashboard/${owner}/${repo}/files`

  // Sort files: directories first, then files
  const sortedFiles = [...files].sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name)
    }
    return a.type === "dir" ? -1 : 1
  })

  const getHref = (path: string) => {
    const params = new URLSearchParams()
    if (path) params.set("path", path)
    if (branch) params.set("branch", branch)
    return `${resolvedBasePath}?${params.toString()}`
  }

  const parentPath = currentPath.split("/").slice(0, -1).join("/")
  const parentName = parentPath === "" ? `${owner}/${repo}` : parentPath.split("/").slice(-1)[0]

  return (
    <div className="border-t border-border">
      <div className="divide-y divide-border">
        {currentPath && (
          <Button
            variant="ghost"
            asChild
            className="w-full justify-start gap-2.5 rounded-none px-4 py-2.5 h-auto font-normal text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <Link href={getHref(parentPath)}>
              <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
              <span className="text-sm font-mono">{parentName}</span>
            </Link>
          </Button>
        )}
        {sortedFiles.length === 0 && !currentPath ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No files found in this directory.</p>
          </div>
        ) : (
          sortedFiles.map((file) => (
            <FileItem
              key={file.path}
              file={file}
              owner={owner}
              repo={repo}
              branch={branch}
              basePath={resolvedBasePath}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface FileItemProps {
  file: GitHubFile
  owner: string
  repo: string
  branch: string
  basePath: string
}

function FileItem({ file, owner, repo, branch, basePath }: FileItemProps) {
  const isDirectory = file.type === "dir"

  const getHref = () => {
    const params = new URLSearchParams()
    if (branch) params.set("branch", branch)

    if (isDirectory) {
      params.set("path", file.path)
      return `${basePath}?${params.toString()}`
    } else {
      return `/dashboard/${owner}/${repo}/blob/${file.path}?${params.toString()}`
    }
  }

  return (
    <Button
      variant="ghost"
      asChild
      className={cn("w-full justify-start gap-2.5 rounded-none px-4 py-2.5 h-auto font-normal hover:bg-muted/50")}
    >
      <Link href={getHref()}>
        {isDirectory ? (
          <Folder className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-mono truncate">{file.name}</span>
      </Link>
    </Button>
  )
}
