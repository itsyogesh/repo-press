"use client"

import { File, Folder } from "lucide-react"
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

export function FileBrowser({
  files,
  currentPath = "",
  owner,
  repo,
  branch = "main",
  basePath,
}: FileBrowserProps) {
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

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted/50 px-4 py-2 border-b flex items-center justify-between">
        <p className="text-sm font-medium">Files</p>
        <span className="text-xs text-muted-foreground">{files.length} items</span>
      </div>
      <div className="divide-y">
        {currentPath && (
          <div className="p-0">
            <Button
              variant="ghost"
              asChild
              className="w-full justify-start gap-2 rounded-none px-4 py-2 h-auto font-normal hover:bg-muted/50"
            >
              <Link href={getHref(currentPath.split("/").slice(0, -1).join("/"))}>
                <Folder className="h-4 w-4 shrink-0 text-blue-500" />
                <span className="text-sm">..</span>
              </Link>
            </Button>
          </div>
        )}
        {sortedFiles.map((file) => (
          <FileItem
            key={file.path}
            file={file}
            owner={owner}
            repo={repo}
            branch={branch}
            basePath={resolvedBasePath}
          />
        ))}
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
      className={cn("w-full justify-start gap-2 rounded-none px-4 py-2 h-auto font-normal hover:bg-muted/50")}
    >
      <Link href={getHref()}>
        {isDirectory ? (
          <Folder className="h-4 w-4 shrink-0 text-blue-500" />
        ) : (
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm truncate">{file.name}</span>
      </Link>
    </Button>
  )
}
