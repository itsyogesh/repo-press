"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CreateFileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentPath: string
  contentRoot?: string
  onConfirm: (fileName: string, parentPath: string) => void
}

export function CreateFileDialog({
  open,
  onOpenChange,
  parentPath,
  contentRoot = "",
  onConfirm,
}: CreateFileDialogProps) {
  const [fileName, setFileName] = React.useState("")

  // Strip contentRoot from display path
  const displayPath = contentRoot && parentPath.startsWith(contentRoot)
    ? parentPath.slice(contentRoot.length).replace(/^\//, "")
    : parentPath

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fileName.trim()) return

    // Auto-append .mdx if no extension provided
    let finalName = fileName.trim()
    if (!finalName.match(/\.(mdx?|markdown|json)$/i)) {
      finalName += ".mdx"
    }

    onConfirm(finalName, parentPath)
    setFileName("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
            <DialogDescription>
              {displayPath ? `Create a new file in ${displayPath}` : "Create a new file in the content root"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="fileName">File Name</Label>
            <Input
              id="fileName"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="my-new-file.mdx"
              className="mt-2"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">
              .mdx extension will be added automatically if not specified (or use .json, .md)
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!fileName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
