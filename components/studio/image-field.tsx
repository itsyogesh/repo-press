"use client"

import { ExternalLink, ImageIcon, Images, Link as LinkIcon, RefreshCw, Trash2, Upload } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { downloadExternalImage } from "@/lib/studio/download-external-image"
import { getAuthoredImageValue } from "@/lib/studio/image-authoring"
import { isSafeImageSrc, normalizeExternalImageUrl } from "@/lib/studio/image-url"
import { getSuggestedImagePath, resolveStudioAssetUrl } from "@/lib/studio/media-resolve"
import { cn } from "@/lib/utils"
import { GalleryTab } from "./gallery-tab"
import { ImageUploadZone } from "./image-upload-zone"
import { useStudio } from "./studio-context"

interface ImageFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  selectedFilePath?: string
  fieldName?: string
  semanticRole?: string
}

export function ImageField({
  value,
  onChange,
  placeholder = "Select or upload image...",
  className,
  selectedFilePath: selectedFilePathProp,
  fieldName,
  semanticRole,
}: ImageFieldProps) {
  const {
    projectId,
    userId,
    selectedFilePath: selectedFilePathContext,
    owner,
    repo,
    branch,
    baseCommitSha,
    contentRoot,
    projectAccessToken,
  } = useStudio()
  const selectedFilePath = selectedFilePathProp ?? selectedFilePathContext
  const [browserOpen, setBrowserOpen] = React.useState(false)
  const resolvedValuePreview = value
    ? resolveStudioAssetUrl(value, projectId, userId, selectedFilePath, undefined, contentRoot)
    : value

  const handleSelectImage = (path: string) => {
    onChange(path)
    setBrowserOpen(false)
  }

  const pathHint = selectedFilePath ? getSuggestedImagePath(selectedFilePath, contentRoot) : "public/images"

  const displayValue = value ? (value.startsWith("/") ? value : `/${value}`) : ""

  if (value && isSafeImageSrc(value)) {
    return (
      <BlurFade delay={0.1} inView>
        <div
          className={cn(
            "relative group rounded-lg border border-studio-border overflow-hidden bg-studio-canvas-inset transition-all duration-200 hover:border-studio-border-hover",
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

            {/* Overlay actions */}
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
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-8 w-8"
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
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setBrowserOpen(true)}>
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Re-use selection dialog */}
        <ImageSelectorDialog
          open={browserOpen}
          onOpenChange={setBrowserOpen}
          onSelect={handleSelectImage}
          projectId={projectId}
          userId={userId}
          owner={owner}
          repo={repo}
          branch={branch}
          baseCommitSha={baseCommitSha}
          pathHint={pathHint}
          selectedFilePath={selectedFilePath}
          authoredValueUsage="frontmatter"
          fieldName={fieldName}
          semanticRole={semanticRole}
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
        baseCommitSha={baseCommitSha}
        pathHint={pathHint}
        selectedFilePath={selectedFilePath}
        contentRoot={contentRoot}
        authoredValueUsage="frontmatter"
        fieldName={fieldName}
        semanticRole={semanticRole}
        projectAccessToken={projectAccessToken}
      />
    </>
  )
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
  baseCommitSha: string
  pathHint: string
  selectedFilePath?: string
  contentRoot?: string
  authoredValueUsage?: "frontmatter" | "component" | "editor"
  fieldName?: string
  semanticRole?: string
  projectAccessToken?: string
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
  baseCommitSha,
  pathHint,
  selectedFilePath,
  contentRoot,
  authoredValueUsage = "frontmatter",
  fieldName,
  semanticRole,
  projectAccessToken,
}: ImageSelectorDialogProps) {
  const [urlValue, setUrlValue] = React.useState("")
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [downloadProgress, setDownloadProgress] = React.useState(0)
  const normalizedUrlValue = normalizeExternalImageUrl(urlValue)
  const canUseUrl = Boolean(normalizedUrlValue) && isSafeImageSrc(normalizedUrlValue)

  const handleUseUrl = React.useCallback(async () => {
    const normalized = normalizeExternalImageUrl(urlValue)
    if (!normalized || !isSafeImageSrc(normalized)) return

    if (
      !projectId ||
      !owner ||
      !repo ||
      !branch ||
      (!normalized.startsWith("http://") && !normalized.startsWith("https://"))
    ) {
      onSelect(normalized)
      return
    }

    setIsDownloading(true)
    setDownloadProgress(15)
    let progressInterval: ReturnType<typeof setInterval> | undefined

    try {
      progressInterval = setInterval(() => {
        setDownloadProgress((prev) => (prev < 90 ? prev + 10 : prev))
      }, 400)

      const result = await downloadExternalImage({
        url: normalized,
        projectId,
        userId,
        owner,
        repo,
        branch,
        pathHint,
        sourceFilePath: selectedFilePath,
      })

      setDownloadProgress(100)
      onSelect(
        getAuthoredImageValue({
          repoPath: result.repoPath,
          selectedFilePath,
          usage: authoredValueUsage,
          fieldName,
          semanticRole,
        }),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download image")
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval)
      }
      setIsDownloading(false)
      setDownloadProgress(0)
    }
  }, [
    urlValue,
    projectId,
    owner,
    repo,
    branch,
    onSelect,
    userId,
    pathHint,
    selectedFilePath,
    authoredValueUsage,
    fieldName,
    semanticRole,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl overflow-hidden flex flex-col max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="rp-display">Select Image</DialogTitle>
          <DialogDescription>Choose an image for your content</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 border-b border-studio-border">
            <TabsList className="w-full justify-start h-10 bg-transparent gap-6">
              <TabsTrigger
                value="upload"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-studio-accent data-[state=active]:bg-transparent px-0 h-10 shadow-none"
              >
                <Upload className="h-3.5 w-3.5 mr-2" />
                Upload
              </TabsTrigger>
              {projectId && (
                <TabsTrigger
                  value="gallery"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-studio-accent data-[state=active]:bg-transparent px-0 h-10 shadow-none"
                >
                  <Images className="h-3.5 w-3.5 mr-2" />
                  Gallery
                </TabsTrigger>
              )}
              <TabsTrigger
                value="url"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-studio-accent data-[state=active]:bg-transparent px-0 h-10 shadow-none"
              >
                <LinkIcon className="h-3.5 w-3.5 mr-2" />
                Link
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="upload" className="flex-1 overflow-y-auto mt-0">
            <div className="p-6">
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
                  selectedFilePath={selectedFilePath}
                  sourceFilePath={selectedFilePath}
                  authoredValueUsage={authoredValueUsage}
                  fieldName={fieldName}
                  semanticRole={semanticRole}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-studio-fg-muted">
                  <p className="text-sm">Upload context unavailable</p>
                </div>
              )}
            </div>
          </TabsContent>

          {projectId && (
            <TabsContent value="gallery" className="flex-1 flex flex-col overflow-hidden mt-0">
              <GalleryTab
                projectId={projectId}
                userId={userId}
                owner={owner ?? ""}
                repo={repo ?? ""}
                branch={branch ?? "main"}
                baseCommitSha={baseCommitSha}
                projectAccessToken={projectAccessToken}
                selectedFilePath={selectedFilePath}
                contentRoot={contentRoot}
                authoredValueUsage={authoredValueUsage}
                fieldName={fieldName}
                semanticRole={semanticRole}
                onSelect={onSelect}
              />
            </TabsContent>
          )}

          <TabsContent value="url" className="flex-1 overflow-y-auto mt-0">
            <div className="p-6 space-y-4">
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
                  <Button onClick={() => void handleUseUrl()} disabled={!canUseUrl || isDownloading}>
                    Use URL
                  </Button>
                </div>
                <p className="text-[10px] text-studio-fg-muted">Paste a direct link to an image.</p>
              </div>

              {isDownloading && (
                <div className="space-y-2">
                  <p className="text-xs text-studio-fg-muted">Downloading and staging image...</p>
                  <Progress value={downloadProgress} className="h-1" />
                </div>
              )}

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
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
