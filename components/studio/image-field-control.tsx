"use client"

import { ExternalLink, ImageIcon, RefreshCw, Trash2 } from "lucide-react"
import * as React from "react"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSuggestedImagePath, resolveStudioAssetUrl } from "@/lib/studio/media-resolve"
import { cn } from "@/lib/utils"
import { ImageUploadZone } from "./image-upload-zone"
import { useStudio } from "./studio-context"

interface ImageFieldControlProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Current file path (for suggested upload paths) */
  selectedFilePath?: string
  repoContext?: {
    projectId: string
    userId?: string
    owner: string
    repo: string
    branch: string
  }
}

function isSafeSrc(src: string): boolean {
  const trimmed = src.trim()
  if (!trimmed) return false
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return true
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return !trimmed.includes(":")
  }
}

function normalizeExternalImageUrl(src: string): string {
  const trimmed = src.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return trimmed
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

interface ImageSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onSelect: (path: string) => void
  projectId?: string
  userId?: string
  owner?: string
  repo?: string
  branch?: string
  pathHint: string
  selectedFilePath?: string
}

function ImageSelectorDialog({
  open,
  onOpenChange,
  value,
  onSelect,
  projectId,
  userId,
  owner,
  repo,
  branch,
  pathHint,
  selectedFilePath,
}: ImageSelectorDialogProps) {
  const [urlValue, setUrlValue] = React.useState("")
  const normalizedUrlValue = normalizeExternalImageUrl(urlValue)
  const canUseUrl = Boolean(normalizedUrlValue) && isSafeSrc(normalizedUrlValue)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overflow-hidden flex flex-col max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Select Image</DialogTitle>
          <DialogDescription>Choose an image for your content</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 border-b border-studio-border">
            <TabsList className="w-full justify-start h-10 bg-transparent gap-6">
              <TabsTrigger
                value="upload"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-studio-accent data-[state=active]:bg-transparent px-0 h-10 shadow-none"
              >
                Upload
              </TabsTrigger>
              <TabsTrigger
                value="url"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-studio-accent data-[state=active]:bg-transparent px-0 h-10 shadow-none"
              >
                External URL
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6">
              <TabsContent value="upload" className="mt-0">
                {projectId && owner && repo && branch ? (
                  <ImageUploadZone
                    projectId={projectId}
                    userId={userId}
                    owner={owner}
                    repo={repo}
                    branch={branch}
                    pathHint={pathHint}
                    onUploadComplete={onSelect}
                    active={open}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-studio-fg-muted">
                    <p className="text-sm">Upload context unavailable</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="url" className="mt-0">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="image-url">Image URL</Label>
                    <div className="flex gap-2">
                      <Input
                        id="image-url"
                        value={urlValue}
                        onChange={(e) => setUrlValue(e.target.value)}
                        placeholder="https://example.com/image.jpg"
                        className="border-studio-border"
                      />
                      <Button onClick={() => onSelect(normalizeExternalImageUrl(urlValue))} disabled={!canUseUrl}>
                        Use URL
                      </Button>
                    </div>
                    <p className="text-[10px] text-studio-fg-muted">Paste a direct link to an image.</p>
                  </div>

                  {canUseUrl && (
                    <div className="rounded-lg border border-studio-border overflow-hidden bg-studio-canvas-inset aspect-video">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={normalizedUrlValue}
                        alt="External preview"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = "none"
                        }}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

export function ImageFieldControl({
  value,
  onChange,
  placeholder = "Select or upload image...",
  className,
  selectedFilePath: selectedFilePathProp,
  repoContext,
}: ImageFieldControlProps) {
  const studio = useStudio()
  const projectId = repoContext?.projectId ?? studio.projectId
  const userId = repoContext?.userId ?? studio.userId
  const owner = repoContext?.owner ?? studio.owner
  const repo = repoContext?.repo ?? studio.repo
  const branch = repoContext?.branch ?? studio.branch
  const selectedFilePath = selectedFilePathProp ?? studio.selectedFilePath
  const [browserOpen, setBrowserOpen] = React.useState(false)
  const resolvedValuePreview = value ? resolveStudioAssetUrl(value, projectId, userId, selectedFilePath) : value

  const handleSelectImage = (path: string) => {
    onChange(path)
    setBrowserOpen(false)
  }

  const pathHint = selectedFilePath ? getSuggestedImagePath(selectedFilePath) : "public/images"
  const displayValue = value ? (value.startsWith("/") ? value : `/${value}`) : ""

  if (value && isSafeSrc(value)) {
    return (
      <BlurFade delay={0.1} inView>
        <div
          className={cn(
            "relative group rounded-lg border border-studio-border overflow-hidden bg-studio-canvas-inset transition-all duration-200 hover:border-studio-border-hover shadow-sm",
            className,
          )}
        >
          <div className="aspect-video w-full relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolvedValuePreview}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src =
                  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpath d='m21 15-5-5L5 21'/%3E%3C/svg%3E"
              }}
            />

            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setBrowserOpen(true)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Replace
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => onChange("")}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
              <a
                href={resolvedValuePreview}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-8 w-8"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          <div className="px-3 py-2 border-t border-studio-border bg-background/50 backdrop-blur-sm flex items-center justify-between">
            <span className="text-[10px] font-mono text-studio-fg-muted truncate max-w-[200px]" title={value}>
              {displayValue}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setBrowserOpen(true)}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        <ImageSelectorDialog
          open={browserOpen}
          onOpenChange={setBrowserOpen}
          value={value}
          onSelect={handleSelectImage}
          projectId={projectId}
          userId={userId}
          owner={owner}
          repo={repo}
          branch={branch}
          pathHint={pathHint}
          selectedFilePath={selectedFilePath}
        />
      </BlurFade>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          "w-full h-24 border-2 border-dashed border-studio-border bg-studio-canvas-inset hover:bg-studio-accent/5 hover:border-studio-accent transition-all duration-200 group flex-col gap-2",
          className,
        )}
        onClick={() => setBrowserOpen(true)}
      >
        <div className="p-2 rounded-full bg-background border border-studio-border group-hover:scale-110 transition-transform duration-200">
          <ImageIcon className="h-5 w-5 text-studio-fg-muted group-hover:text-studio-accent transition-colors" />
        </div>
        <span className="text-sm font-medium text-studio-fg-muted group-hover:text-studio-fg">{placeholder}</span>
      </Button>

      <ImageSelectorDialog
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        value={value}
        onSelect={handleSelectImage}
        projectId={projectId}
        userId={userId}
        owner={owner}
        repo={repo}
        branch={branch}
        pathHint={pathHint}
        selectedFilePath={selectedFilePath}
      />
    </>
  )
}
