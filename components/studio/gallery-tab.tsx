"use client"

import { useAction, useConvex, useMutation, useQuery } from "convex/react"
import { Check, ImageIcon, RefreshCw, Search, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { getAuthoredImageValue } from "@/lib/studio/image-authoring"
import { resolveStudioAssetUrl } from "@/lib/studio/media-resolve"
import { cn } from "@/lib/utils"

type MediaAsset = Doc<"mediaAssets">

interface GalleryTabProps {
  projectId: string
  userId?: string
  owner: string
  repo: string
  branch: string
  projectAccessToken?: string
  selectedFilePath?: string
  contentRoot?: string
  authoredValueUsage?: "frontmatter" | "component" | "editor"
  fieldName?: string
  semanticRole?: string
  onSelect: (authoredPath: string) => void
}

const PAGE_SIZE = 24

/**
 * Derives the section slug (e.g. "blog") from a file path relative to contentRoot.
 *
 * When contentRoot is set (e.g. "content"):
 *   "content/blog/post.mdx" + "content" → "blog"
 *
 * When contentRoot is empty (content lives at repo root):
 *   "content/blog/post.mdx" + "" → "blog" (skips the first segment as the container dir)
 *   "blog/post.mdx" + "" → undefined (single-level, no section)
 *
 * Returns undefined when section cannot be determined (root-level files, no subdirectory).
 */
function deriveSectionSlug(filePath: string | undefined, contentRoot: string | undefined): string | undefined {
  if (!filePath) return undefined

  const normalizedRoot = contentRoot ? contentRoot.replace(/\/+$/, "") : ""
  const root = normalizedRoot ? normalizedRoot + "/" : ""

  let relative: string
  if (root && filePath.startsWith(root)) {
    // Strip the known contentRoot prefix, then take the first folder segment
    relative = filePath.slice(root.length)
  } else if (!root) {
    // No contentRoot configured — skip the first segment (assumed to be the top-level
    // content container, e.g. "content/" or "docs/") and look one level deeper
    const firstSlash = filePath.indexOf("/")
    if (firstSlash === -1) return undefined
    relative = filePath.slice(firstSlash + 1)
  } else {
    // contentRoot doesn't match this path — cannot determine section reliably
    return undefined
  }

  const parts = relative.split("/")
  return parts.length > 1 ? parts[0] : undefined
}

export function GalleryTab({
  projectId,
  userId,
  owner,
  repo,
  branch,
  projectAccessToken,
  selectedFilePath,
  contentRoot,
  authoredValueUsage = "component",
  fieldName,
  semanticRole,
  onSelect,
}: GalleryTabProps) {
  const convex = useConvex()
  const projectIdTyped = projectId as Id<"projects">

  // ── Section scoping ───────────────────────────────────────────────
  const sectionSlug = React.useMemo(
    () => deriveSectionSlug(selectedFilePath, contentRoot),
    [selectedFilePath, contentRoot],
  )

  // ── Accumulated image list ────────────────────────────────────────
  const [allItems, setAllItems] = React.useState<MediaAsset[]>([])
  const [continueCursor, setContinueCursor] = React.useState<string | null>(null)
  const [isDone, setIsDone] = React.useState(false)
  const [isLoadingMore, setIsLoadingMore] = React.useState(false)

  // ── Selection & detail panel ──────────────────────────────────────
  const [selectedAsset, setSelectedAsset] = React.useState<MediaAsset | null>(null)
  const [altTextDraft, setAltTextDraft] = React.useState("")
  const [isSavingAlt, setIsSavingAlt] = React.useState(false)
  const altTextChanged = selectedAsset && altTextDraft !== (selectedAsset.altText ?? "")

  // ── Search ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = React.useState("")

  // ── Scan state ────────────────────────────────────────────────────
  const [isScanning, setIsScanning] = React.useState(false)

  // ── Initial page load ─────────────────────────────────────────────
  const firstPage = useQuery(api.mediaAssets.listByProjectPaginated, {
    projectId: projectIdTyped,
    userId,
    projectAccessToken,
    cursor: undefined,
    limit: PAGE_SIZE,
    sectionSlug,
  })

  const initializedRef = React.useRef(false)
  React.useEffect(() => {
    if (firstPage && !initializedRef.current) {
      initializedRef.current = true
      setAllItems(firstPage.page as MediaAsset[])
      setContinueCursor(firstPage.continueCursor)
      setIsDone(firstPage.isDone)
    }
  }, [firstPage])

  // Reset accumulated items when section scope changes
  const prevSectionSlugRef = React.useRef(sectionSlug)
  React.useEffect(() => {
    if (sectionSlug !== prevSectionSlugRef.current) {
      prevSectionSlugRef.current = sectionSlug
      initializedRef.current = false
      setAllItems([])
      setContinueCursor(null)
      setIsDone(false)
    }
  }, [sectionSlug])

  // ── Pending ops for staged badge ──────────────────────────────────
  const pendingOps = useQuery(api.mediaOps.listPending, {
    projectId: projectIdTyped,
    userId,
    projectAccessToken,
  })
  const pendingPaths = React.useMemo(() => new Set(pendingOps?.map((op) => op.repoPath) ?? []), [pendingOps])

  // ── Mutations ─────────────────────────────────────────────────────
  const updateAltText = useMutation(api.mediaAssets.updateAltText)

  // ── Client-side filter ────────────────────────────────────────────
  const filteredItems = React.useMemo(() => {
    if (!searchQuery.trim()) return allItems
    const q = searchQuery.toLowerCase()
    return allItems.filter(
      (item) =>
        item.fileName.toLowerCase().includes(q) ||
        item.filePath.toLowerCase().includes(q) ||
        (item.altText ?? "").toLowerCase().includes(q),
    )
  }, [allItems, searchQuery])

  // ── Sync alt text draft to selection ─────────────────────────────
  React.useEffect(() => {
    if (selectedAsset) setAltTextDraft(selectedAsset.altText ?? "")
  }, [selectedAsset?._id])

  // ── Load More ─────────────────────────────────────────────────────
  const handleLoadMore = React.useCallback(async () => {
    if (!continueCursor || isDone || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const result = await convex.query(api.mediaAssets.listByProjectPaginated, {
        projectId: projectIdTyped,
        userId,
        projectAccessToken,
        cursor: continueCursor,
        limit: PAGE_SIZE,
        sectionSlug,
      })
      setAllItems((prev) => [...prev, ...(result.page as MediaAsset[])])
      setContinueCursor(result.continueCursor)
      setIsDone(result.isDone)
    } catch {
      toast.error("Failed to load more images")
    } finally {
      setIsLoadingMore(false)
    }
  }, [continueCursor, isDone, isLoadingMore, convex, projectIdTyped, userId, projectAccessToken, sectionSlug])

  // ── Save alt text ─────────────────────────────────────────────────
  const handleSaveAltText = React.useCallback(async () => {
    if (!selectedAsset || !altTextChanged) return
    setIsSavingAlt(true)
    try {
      await updateAltText({
        id: selectedAsset._id,
        altText: altTextDraft,
        userId,
        projectAccessToken,
      })
      setSelectedAsset((prev) => (prev ? { ...prev, altText: altTextDraft } : prev))
      setAllItems((prev) =>
        prev.map((item) => (item._id === selectedAsset._id ? { ...item, altText: altTextDraft } : item)),
      )
    } catch {
      toast.error("Failed to save alt text")
    } finally {
      setIsSavingAlt(false)
    }
  }, [selectedAsset, altTextDraft, altTextChanged, updateAltText, userId, projectAccessToken])

  // ── Scan repo ─────────────────────────────────────────────────────
  const handleScan = React.useCallback(async () => {
    setIsScanning(true)
    try {
      const res = await fetch("/api/media/scan-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, owner, repo, branch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Scan failed")

      // Refresh gallery by resetting pagination
      initializedRef.current = false
      setAllItems([])
      setContinueCursor(null)
      setIsDone(false)

      const { found, inserted } = data as { found: number; inserted: number; updated: number }
      if (inserted > 0) {
        toast.success(`Found ${found} images — ${inserted} newly added to gallery`)
      } else {
        toast.success(`Scanned ${found} images — gallery is up to date`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to scan repository")
    } finally {
      setIsScanning(false)
    }
  }, [projectId, owner, repo, branch])

  // ── Select image ──────────────────────────────────────────────────
  const handleUseImage = React.useCallback(
    (asset: MediaAsset) => {
      const authoredPath = getAuthoredImageValue({
        repoPath: asset.filePath,
        selectedFilePath,
        usage: authoredValueUsage,
        fieldName,
        semanticRole,
      })
      onSelect(authoredPath)
    },
    [selectedFilePath, authoredValueUsage, fieldName, semanticRole, onSelect],
  )

  // ── Thumbnail URL ─────────────────────────────────────────────────
  const buildThumbUrl = (filePath: string) =>
    resolveStudioAssetUrl(filePath, projectId, userId, selectedFilePath, projectAccessToken, contentRoot)

  // ── Loading state ─────────────────────────────────────────────────
  const isLoading = firstPage === undefined

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-studio-border shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-studio-fg-muted pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search images…"
            className="pl-8 h-8 text-sm border-studio-border bg-studio-canvas-inset"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-studio-fg-muted hover:text-studio-fg transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {sectionSlug && (
          <span
            className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-studio-accent/10 text-studio-accent border border-studio-accent/20"
            title={`Showing images from the "${sectionSlug}" folder`}
          >
            {sectionSlug}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleScan()}
          disabled={isScanning}
          className="h-8 gap-1.5 text-xs border-studio-border shrink-0"
        >
          <RefreshCw className={cn("h-3 w-3", isScanning && "animate-spin")} />
          {isScanning ? "Scanning…" : "Scan Repo"}
        </Button>
      </div>

      {/* Content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Grid panel */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <GallerySkeletonGrid />
          ) : filteredItems.length === 0 ? (
            <GalleryEmptyState hasSearch={searchQuery.length > 0} onScan={() => void handleScan()} />
          ) : (
            <div className="p-3">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {filteredItems.map((asset) => (
                  <GalleryThumbnail
                    key={asset._id}
                    asset={asset}
                    thumbUrl={buildThumbUrl(asset.filePath)}
                    isSelected={selectedAsset?._id === asset._id}
                    isStaged={pendingPaths.has(asset.filePath)}
                    onClick={() => setSelectedAsset(asset)}
                  />
                ))}
              </div>

              {!isDone && !searchQuery && !sectionSlug && (
                <div className="flex justify-center mt-4 pb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleLoadMore()}
                    disabled={isLoadingMore}
                    className="text-xs text-studio-fg-muted hover:text-studio-fg"
                  >
                    {isLoadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedAsset && (
          <div className="w-52 shrink-0 border-l border-studio-border flex flex-col bg-studio-canvas-inset overflow-y-auto">
            <GalleryDetailPanel
              asset={selectedAsset}
              thumbUrl={buildThumbUrl(selectedAsset.filePath)}
              isStaged={pendingPaths.has(selectedAsset.filePath)}
              altTextDraft={altTextDraft}
              altTextChanged={!!altTextChanged}
              isSavingAlt={isSavingAlt}
              onAltTextChange={setAltTextDraft}
              onSaveAltText={() => void handleSaveAltText()}
              onUseImage={() => handleUseImage(selectedAsset)}
              onClose={() => setSelectedAsset(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface GalleryThumbnailProps {
  asset: MediaAsset
  thumbUrl: string
  isSelected: boolean
  isStaged: boolean
  onClick: () => void
}

function GalleryThumbnail({ asset, thumbUrl, isSelected, isStaged, onClick }: GalleryThumbnailProps) {
  const [imgState, setImgState] = React.useState<"loading" | "loaded" | "error">("loading")

  return (
    <button
      type="button"
      onClick={onClick}
      title={asset.altText ?? asset.fileName}
      className={cn(
        "relative group rounded-md overflow-hidden aspect-square bg-studio-canvas-inset border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent",
        isSelected
          ? "border-studio-accent ring-2 ring-studio-accent/30"
          : "border-studio-border hover:border-studio-accent/50",
      )}
    >
      {/* Shimmer while loading */}
      {imgState === "loading" && <div className="absolute inset-0 animate-pulse bg-studio-canvas-inset" />}

      {/* Error fallback */}
      {imgState === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-studio-canvas-inset">
          <ImageIcon className="h-5 w-5 text-studio-fg-muted opacity-40" />
        </div>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl}
        alt={asset.altText ?? asset.fileName}
        loading="lazy"
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          imgState === "loaded" ? "opacity-100" : "opacity-0",
        )}
        onLoad={() => setImgState("loaded")}
        onError={() => setImgState("error")}
      />

      {/* Staged badge */}
      {isStaged && (
        <span className="absolute top-1 right-1 bg-studio-attention text-white text-[9px] font-semibold leading-none px-1 py-0.5 rounded-sm">
          Staged
        </span>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
    </button>
  )
}

interface GalleryDetailPanelProps {
  asset: MediaAsset
  thumbUrl: string
  isStaged: boolean
  altTextDraft: string
  altTextChanged: boolean
  isSavingAlt: boolean
  onAltTextChange: (val: string) => void
  onSaveAltText: () => void
  onUseImage: () => void
  onClose: () => void
}

function DetailPreviewImage({ src, alt }: { src: string; alt: string }) {
  const [imgState, setImgState] = React.useState<"loading" | "loaded" | "error">("loading")
  return (
    <div className="relative aspect-square bg-studio-canvas border-b border-studio-border overflow-hidden shrink-0">
      {imgState === "loading" && <div className="absolute inset-0 animate-pulse bg-studio-canvas-inset" />}
      {imgState === "error" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-studio-fg-muted opacity-30" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={cn(
          "w-full h-full object-contain transition-opacity duration-300",
          imgState === "loaded" ? "opacity-100" : "opacity-0",
        )}
        onLoad={() => setImgState("loaded")}
        onError={() => setImgState("error")}
      />
    </div>
  )
}

function GalleryDetailPanel({
  asset,
  thumbUrl,
  isStaged,
  altTextDraft,
  altTextChanged,
  isSavingAlt,
  onAltTextChange,
  onSaveAltText,
  onUseImage,
  onClose,
}: GalleryDetailPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-studio-border shrink-0">
        <span className="text-xs font-medium text-studio-fg truncate flex-1 mr-1" title={asset.fileName}>
          {asset.fileName}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-studio-fg-muted hover:text-studio-fg transition-colors cursor-pointer shrink-0"
          aria-label="Close detail"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Preview */}
      <DetailPreviewImage src={thumbUrl} alt={asset.altText ?? asset.fileName} />

      {/* Metadata */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Staged badge */}
        {isStaged && (
          <Badge
            variant="secondary"
            className="text-[10px] bg-studio-attention-muted text-studio-attention border-studio-attention/30"
          >
            Staged
          </Badge>
        )}

        {/* Path */}
        <div>
          <p className="text-[10px] text-studio-fg-muted font-medium uppercase tracking-wide mb-0.5">Path</p>
          <p className="text-[10px] text-studio-fg break-all leading-relaxed">{asset.filePath}</p>
        </div>

        {/* Dimensions */}
        {asset.width && asset.height && (
          <div>
            <p className="text-[10px] text-studio-fg-muted font-medium uppercase tracking-wide mb-0.5">Size</p>
            <p className="text-[10px] text-studio-fg">
              {asset.width} × {asset.height}px
              {asset.sizeBytes ? ` · ${formatBytes(asset.sizeBytes)}` : ""}
            </p>
          </div>
        )}

        {/* Alt text */}
        <div>
          <Label className="text-[10px] text-studio-fg-muted font-medium uppercase tracking-wide mb-1 block">
            Alt Text
          </Label>
          <Textarea
            value={altTextDraft}
            onChange={(e) => onAltTextChange(e.target.value)}
            placeholder="Describe this image…"
            className="text-xs h-16 resize-none border-studio-border bg-studio-canvas focus:border-studio-accent"
          />
          {altTextChanged && (
            <button
              type="button"
              onClick={onSaveAltText}
              disabled={isSavingAlt}
              className="flex items-center gap-1 mt-1 text-[10px] text-studio-accent hover:underline disabled:opacity-50 cursor-pointer"
            >
              <Check className="h-3 w-3" />
              {isSavingAlt ? "Saving…" : "Save alt text"}
            </button>
          )}
        </div>
      </div>

      {/* Use button */}
      <div className="p-3 border-t border-studio-border shrink-0">
        <Button size="sm" className="w-full text-xs h-8" onClick={onUseImage}>
          Use this image
        </Button>
      </div>
    </div>
  )
}

const SKELETON_KEYS = ["sk-a", "sk-b", "sk-c", "sk-d", "sk-e", "sk-f", "sk-g", "sk-h"]

function GallerySkeletonGrid() {
  return (
    <div className="p-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
      {SKELETON_KEYS.map((k) => (
        <div key={k} className="aspect-square rounded-md bg-studio-canvas-inset animate-pulse" />
      ))}
    </div>
  )
}

function GalleryEmptyState({ hasSearch, onScan }: { hasSearch: boolean; onScan: () => void }) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center px-6">
        <ImageIcon className="h-8 w-8 text-studio-fg-muted mb-2 opacity-40" />
        <p className="text-sm text-studio-fg-muted">No images match your search</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-48 text-center px-6 gap-3">
      <ImageIcon className="h-10 w-10 text-studio-fg-muted opacity-30" />
      <div>
        <p className="text-sm font-medium text-studio-fg">No images yet</p>
        <p className="text-xs text-studio-fg-muted mt-0.5">Upload an image or scan your repo to discover images</p>
      </div>
      <Button variant="outline" size="sm" onClick={onScan} className="h-7 text-xs gap-1.5 border-studio-border">
        <RefreshCw className="h-3 w-3" />
        Scan Repo
      </Button>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
