"use client"

import * as React from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { FileTree } from "./file-tree"
import { Editor } from "./editor"
import { Preview } from "./preview"
import type { GitHubFile } from "@/lib/github"
import matter from "gray-matter"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface StudioLayoutProps {
  files: GitHubFile[]
  initialFile?: {
    path: string
    content: string
    sha: string
  } | null
  owner: string
  repo: string
  branch: string
  currentPath: string
}

export function StudioLayout({ files, initialFile, owner, repo, branch, currentPath }: StudioLayoutProps) {
  const router = useRouter()
  const [selectedFile, setSelectedFile] = React.useState<GitHubFile | null>(null)
  const [content, setContent] = React.useState("")
  const [frontmatter, setFrontmatter] = React.useState<Record<string, any>>({})
  const [sha, setSha] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)

  // Initialize state from initialFile
  React.useEffect(() => {
    if (initialFile) {
      try {
        const { data, content: fileContent } = matter(initialFile.content)
        setFrontmatter(data)
        setContent(fileContent)
        setSha(initialFile.sha)
        // Find the file object in the list if possible, or create a dummy one
        const fileObj = files.find((f) => f.path === initialFile.path) || {
          name: initialFile.path.split("/").pop() || "",
          path: initialFile.path,
          sha: initialFile.sha,
          type: "file",
          download_url: null,
        }
        setSelectedFile(fileObj)
      } catch (e) {
        console.error("Error parsing frontmatter:", e)
        setContent(initialFile.content)
        setFrontmatter({})
      }
    }
  }, [initialFile, files])

  const handleSelectFile = (file: GitHubFile) => {
    if (file.type === "dir") {
      // Navigate to directory
      router.push(`/dashboard/${owner}/${repo}/studio/${file.path}?branch=${branch}`)
    } else {
      // Navigate to file
      router.push(`/dashboard/${owner}/${repo}/studio/${file.path}?branch=${branch}`)
    }
  }

  const handleSave = async () => {
    if (!selectedFile) return

    setIsSaving(true)
    try {
      // Reconstruct file content
      const fileContent = matter.stringify(content, frontmatter)

      const response = await fetch("/api/github/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner,
          repo,
          path: selectedFile.path,
          content: fileContent,
          sha,
          branch,
        }),
      })

      if (!response.ok) throw new Error("Failed to save")

      const data = await response.json()
      setSha(data.content.sha) // Update SHA for next save
      toast.success("File saved successfully")
    } catch (error) {
      console.error("Error saving:", error)
      toast.error("Failed to save file")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] w-full border-t">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <FileTree
            files={files}
            onSelect={handleSelectFile}
            selectedPath={selectedFile?.path}
            currentPath={currentPath}
          />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={40} minSize={30}>
          {selectedFile ? (
            <Editor
              content={content}
              frontmatter={frontmatter}
              onChangeContent={setContent}
              onChangeFrontmatter={(key, value) => setFrontmatter((prev) => ({ ...prev, [key]: value }))}
              onSave={handleSave}
              isSaving={isSaving}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">Select a file to edit</div>
          )}
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={40} minSize={30}>
          <Preview content={content} frontmatter={frontmatter} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
