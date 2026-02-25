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
  onConfirm: (fileName: string, parentPath: string) => void
}

export function CreateFileDialog({
  open,
  onOpenChange,
  parentPath,
  onConfirm,
}: CreateFileDialogProps) {
  const [fileName, setFileName] = React.useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fileName.trim()) return

    // Auto-append .mdx if no extension
    let finalName = fileName.trim()
    if (!finalName.match(/\.(mdx?|markdown)$/i)) {
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
              {parentPath
                ? `Create a new file in ${parentPath}`
                : "Create a new file in the content root"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="fileName">File Name</Label>
            <Input
              id="fileName"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="my-new-post.mdx"
              className="mt-2"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">
              .mdx extension will be added automatically if not specified
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
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
