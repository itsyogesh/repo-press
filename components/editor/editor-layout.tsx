"use client"

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { FileBrowser } from "@/components/file-browser"
import { MarkdownEditor } from "@/components/editor/markdown-editor"
import { Preview } from "@/components/editor/preview"
import { FrontmatterForm, type Frontmatter } from "@/components/editor/frontmatter-form"
import { useState, useEffect } from "react"
import type { GitHubFile } from "@/lib/github"
import { Button } from "@/components/ui/button"
import { Save, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface EditorLayoutProps {
  files: GitHubFile[]
  initialContent: string
  initialSha: string
  fileName: string
  filePath: string
  owner: string
  repo: string
  onSave: (content: string, sha: string) => Promise<void>
}

export function EditorLayout({
  files,
  initialContent,
  initialSha,
  fileName,
  filePath,
  owner,
  repo,
  onSave,
}: EditorLayoutProps) {
  const [content, setContent] = useState(initialContent)
  const [frontmatter, setFrontmatter] = useState<Frontmatter>({})
  const [markdownBody, setMarkdownBody] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [sha, setSha] = useState(initialSha)

  // Simple frontmatter parser
  useEffect(() => {
    const parseContent = () => {
      const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
      if (match) {
        const fmRaw = match[1]
        const body = match[2]
        const fm: Frontmatter = {}
        fmRaw.split("\n").forEach((line) => {
          const [key, ...val] = line.split(":")
          if (key && val) {
            fm[key.trim()] = val.join(":").trim()
          }
        })
        setFrontmatter(fm)
        setMarkdownBody(body)
      } else {
        setMarkdownBody(content)
      }
    }
    parseContent()
  }, []) // Run once on mount

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Reconstruct content
      let newContent = markdownBody
      if (Object.keys(frontmatter).length > 0) {
        const fmString = Object.entries(frontmatter)
          .map(([key, val]) => `${key}: ${val}`)
          .join("\n")
        newContent = `---\n${fmString}\n---\n${markdownBody}`
      }

      await onSave(newContent, sha)
      toast.success("File saved successfully")
    } catch (error) {
      toast.error("Failed to save file")
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="border-b p-2 flex items-center justify-between bg-background">
        <div className="font-medium text-sm px-2">{fileName}</div>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </div>
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <div className="h-full overflow-auto border-r">
            <FileBrowser files={files} owner={owner} repo={repo} currentPath={filePath} />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={40}>
          <div className="h-full flex flex-col">
            <FrontmatterForm data={frontmatter} onChange={setFrontmatter} />
            <div className="flex-1 overflow-hidden">
              <MarkdownEditor content={markdownBody} onChange={setMarkdownBody} />
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={40}>
          <div className="h-full border-l bg-muted/10">
            <Preview content={markdownBody} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
