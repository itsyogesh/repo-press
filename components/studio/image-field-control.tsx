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
import { isSafeImageSrc, normalizeExternalImageUrl } from "@/lib/studio/image-url"
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

interface ImageSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
  projectId?: string
  userId?: string
  owner?: string
  repo?: string
  branch?: string
  pathHint: string
}

function ImageSelectorDialog({
  open,
  onOpenChange,
  onSelect,
  projectId,
  userId,
  owner,
  repo,
  branch,
  pathHint,
}: ImageSelectorDialogProps) {
  const [urlValue, setUrlValue] = React.useState("")
  const normalizedUrlValue = normalizeExternalImageUrl(urlValue)
  const canUseUrl = Boolean(normalizedUrlValue) && isSafeImageSrc(normalizedUrlValue)

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
  const [editValue, setEditValue] = React.useState(value)
  const resolvedValuePreview = value ? resolveStudioAssetUrl(value, projectId, userId, selectedFilePath) : value

  // Keep editValue in sync when value changes externally (e.g. on image select)
  React.useEffect(() => {
    setEditValue(value)
  }, [value])

  const handleSelectImage = (path: string) => {
    onChange(path)
    setBrowserOpen(false)
  }

  const commitEdit = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed !== value) onChange(trimmed)
  }

  const pathHint = selectedFilePath ? getSuggestedImagePath(selectedFilePath) : "public/images"

  if (value && isSafeImageSrc(value)) {
    return (
      <BlurFade delay={0.1} inView>
        <div
          className={cn(
            "rounded-lg border border-studio-border bg-studio-canvas-inset px-3 py-2 flex items-center gap-2",
            className,
          )}
        >
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={(e) => commitEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commitEdit(editValue)
              }
              if (e.key === "Escape") {
                setEditValue(value)
              }
            }}
            className="text-[10px] font-mono text-studio-fg-muted flex-1 min-w-0 bg-transparent border-none outline-none focus:text-studio-fg placeholder:text-studio-fg-muted/50"
            placeholder={placeholder}
            title={value}
          />
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setBrowserOpen(true)}
              title="Replace via picker"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <a
              href={resolvedValuePreview}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-7 w-7"
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onChange("")}
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <ImageSelectorDialog
          open={browserOpen}
          onOpenChange={setBrowserOpen}
          onSelect={handleSelectImage}
          projectId={projectId}
          userId={userId}
          owner={owner}
          repo={repo}
          branch={branch}
          pathHint={pathHint}
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
        onSelect={handleSelectImage}
        projectId={projectId}
        userId={userId}
        owner={owner}
        repo={repo}
        branch={branch}
        pathHint={pathHint}
      />
    </>
  )
}
