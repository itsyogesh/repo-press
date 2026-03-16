"use client"

import { FileImage, Loader2, Upload } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { BorderBeam } from "@/components/magicui/border-beam"
import { Progress } from "@/components/ui/progress"
import { uploadMedia } from "@/lib/studio/media-upload"
import { cn } from "@/lib/utils"

interface ImageUploadZoneProps {
  projectId: string
  userId?: string
  owner: string
  repo: string
  branch: string
  pathHint?: string
  onUploadComplete: (repoPath: string) => void
  className?: string
}

export function ImageUploadZone({
  projectId,
  userId,
  owner,
  repo,
  branch,
  pathHint,
  onUploadComplete,
  className,
}: ImageUploadZoneProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleUpload = React.useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload an image file")
        return
      }

      setIsUploading(true)
      setProgress(10) // Initial progress

      let progressInterval: ReturnType<typeof setInterval> | undefined

      try {
        // Simulate some progress since uploadMedia doesn't provide fine-grained progress yet
        progressInterval = setInterval(() => {
          setProgress((prev) => (prev < 90 ? prev + 10 : prev))
        }, 500)

        const result = await uploadMedia({
          file,
          projectId,
          userId,
          owner,
          repo,
          branch,
          pathHint,
        })

        setProgress(100)

        setTimeout(() => {
          onUploadComplete(result.repoPath)
          setIsUploading(false)
          setProgress(0)
          toast.success(`Uploaded ${file.name}`)
        }, 500)
      } catch (error) {
        console.error("Upload error:", error)
        toast.error(error instanceof Error ? error.message : "Failed to upload image")
        setIsUploading(false)
        setProgress(0)
      } finally {
        if (progressInterval) {
          clearInterval(progressInterval)
        }
      }
    },
    [projectId, userId, owner, repo, branch, pathHint, onUploadComplete],
  )

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  // Handle paste from clipboard
  React.useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile()
          if (file) handleUpload(file)
          break
        }
      }
    }

    window.addEventListener("paste", handlePaste)
    return () => window.removeEventListener("paste", handlePaste)
  }, [handleUpload]) // Re-bind if context changes

  return (
    <div
      className={cn(
        "relative group flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-all duration-200 min-h-[160px] p-6",
        isDragging
          ? "border-studio-accent bg-studio-accent/5"
          : "border-studio-border hover:border-studio-border-hover bg-studio-canvas-inset",
        isUploading && "pointer-events-none opacity-80",
        className,
      )}
    >
      <button
        type="button"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-label="Upload image"
      />
      <input type="file" ref={fileInputRef} onChange={onFileChange} accept="image/*" className="hidden" />

      {isUploading ? (
        <div className="flex flex-col items-center gap-4 w-full max-w-[200px]">
          <Loader2 className="h-8 w-8 text-studio-accent animate-spin" />
          <div className="space-y-2 w-full text-center">
            <p className="text-sm font-medium">Uploading...</p>
            <Progress value={progress} className="h-1" />
          </div>
          <BorderBeam size={100} duration={4} colorFrom="#3b82f6" colorTo="#9333ea" />
        </div>
      ) : (
        <>
          <div className="bg-background shadow-sm border border-studio-border rounded-full p-3 mb-3 group-hover:scale-110 transition-transform duration-200">
            <Upload className="h-5 w-5 text-studio-fg-muted group-hover:text-studio-accent transition-colors" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">Click or drag & drop to upload</p>
            <p className="text-xs text-studio-fg-muted">Supports JPG, PNG, WebP, SVG. Paste works too!</p>
          </div>
        </>
      )}

      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-studio-accent/10 rounded-lg pointer-events-none animate-in fade-in duration-200">
          <div className="bg-studio-accent text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2">
            <FileImage className="h-4 w-4" />
            Drop to upload
          </div>
        </div>
      )}
    </div>
  )
}
