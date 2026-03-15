"use client"

import matter from "gray-matter"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import type { MergedFieldDef } from "@/lib/framework-adapters"
import { inferFieldDef, normalizeDate } from "@/lib/framework-adapters"
import { deriveFilename } from "@/lib/framework-adapters/derive-filename"
import { groupFields } from "@/lib/framework-adapters/field-groups"
import { getFolderContext } from "@/lib/framework-adapters/folder-context"
import type { FrameworkAdapter, FrontmatterFieldDef } from "@/lib/framework-adapters/types"
import type { FileTreeNode } from "@/lib/github"
import { FrontmatterField } from "./frontmatter-field"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SmartCreateFileResult {
  /** Derived filename (e.g. "my-post.mdx" or "my-post/index.mdx") */
  fileName: string
  /** Parent folder path (same as the parentPath prop) */
  parentPath: string
  /** Initial frontmatter object (title + inferred fields, blank by default) */
  frontmatter: Record<string, unknown>
}

interface SmartCreateFileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Full path of the target folder (e.g. "content/blog") */
  parentPath: string
  /** Project content root — used to compute relative display path */
  contentRoot?: string
  /** Detected framework adapter for this project */
  adapter: FrameworkAdapter | null
  /** Names already present in the target folder (for conflict resolution) */
  folderChildren: string[]
  /** Full FileTreeNode children of the target folder (for sibling inference) */
  folderChildNodes: FileTreeNode[]
  /** GitHub owner (for sibling file fetch) */
  owner: string
  /** GitHub repo (for sibling file fetch) */
  repo: string
  /** GitHub branch (for sibling file fetch) */
  branch: string
  onConfirm: (result: SmartCreateFileResult) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Converts a FrontmatterFieldDef to a MergedFieldDef for use in <FrontmatterField>. */
function toMergedField(f: FrontmatterFieldDef): MergedFieldDef {
  return { ...f, actualFieldName: f.name, isInFile: false }
}

/** Returns a blank/default value for a field (pre-seeds dates with today). */
function blankValue(f: FrontmatterFieldDef): unknown {
  if (f.type === "date") return normalizeDate(new Date())
  if (f.type === "boolean") return false
  if (f.type === "number") return undefined
  if (f.type === "string[]") return []
  return ""
}

const CONTENT_EXTENSIONS = /\.(mdx?|markdown)$/i

/**
 * Find the first non-directory .md/.mdx file among the given tree nodes.
 * Skips index files (index.mdx / index.md) as they're section landing pages.
 */
function findSiblingFile(nodes: FileTreeNode[]): FileTreeNode | null {
  for (const n of nodes) {
    if (n.type === "file" && CONTENT_EXTENSIONS.test(n.name) && !/^index\./i.test(n.name)) {
      return n
    }
  }
  return null
}

/**
 * Fetch a file from GitHub via the internal API and return its parsed frontmatter.
 * Returns null if the fetch fails or the file has no frontmatter.
 */
async function fetchSiblingFrontmatter(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<Record<string, unknown> | null> {
  try {
    const params = new URLSearchParams({ owner, repo, path, branch })
    const res = await fetch(`/api/github/file?${params.toString()}`)
    if (!res.ok) return null
    const payload = (await res.json()) as { content: string; sha: string }
    const parsed = matter(payload.content || "")
    return parsed.data as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Given raw frontmatter from a sibling file, build FrontmatterFieldDef entries
 * for every key that isn't title or draft — these become the template fields
 * shown blank in the dialog. Uses inferFieldDef for rich type inference (SEO fields, etc).
 */
function buildSiblingFields(fm: Record<string, unknown>): FrontmatterFieldDef[] {
  const SKIP = new Set(["title", "draft"])
  return Object.entries(fm)
    .filter(([key]) => !SKIP.has(key))
    .map(([key, value]) => inferFieldDef(key, value))
}

// ─── Component ───────────────────────────────────────────────────────────────

const MIN_SKELETON_MS = 120

export function SmartCreateFileDialog({
  open,
  onOpenChange,
  parentPath,
  contentRoot = "",
  adapter,
  folderChildren,
  folderChildNodes,
  owner,
  repo,
  branch,
  onConfirm,
}: SmartCreateFileDialogProps) {
  const [title, setTitle] = React.useState("")
  // Inferred fields from the sibling file (shown blank in the dialog)
  const [siblingFields, setSiblingFields] = React.useState<FrontmatterFieldDef[]>([])
  // Values for every visible field (sibling + adapter required)
  const [fieldValues, setFieldValues] = React.useState<Record<string, unknown>>({})
  // Whether both the skeleton timer and sibling fetch have resolved
  const [ready, setReady] = React.useState(false)

  // Context derived from folder path + adapter (synchronous)
  const context = React.useMemo(() => {
    return getFolderContext(parentPath, adapter)
  }, [parentPath, adapter])

  // Compute display path (strip contentRoot prefix)
  const displayPath = React.useMemo(() => {
    if (contentRoot && parentPath.startsWith(contentRoot)) {
      return parentPath.slice(contentRoot.length).replace(/^\//, "")
    }
    return parentPath
  }, [parentPath, contentRoot])

  // On dialog open: fetch sibling frontmatter + enforce minimum skeleton time
  React.useEffect(() => {
    if (!open) return

    setTitle("")
    setSiblingFields([])
    setFieldValues({})
    setReady(false)

    let cancelled = false

    const sibling = findSiblingFile(folderChildNodes)

    const skeletonPromise = new Promise<void>((resolve) => setTimeout(resolve, MIN_SKELETON_MS))

    const siblingPromise: Promise<FrontmatterFieldDef[]> = sibling
      ? fetchSiblingFrontmatter(owner, repo, branch, sibling.path).then((fm) => {
          if (!fm || cancelled) return []
          return buildSiblingFields(fm)
        })
      : Promise.resolve([])

    Promise.all([skeletonPromise, siblingPromise]).then(([, inferredFields]) => {
      if (cancelled) return

      // Merge: sibling fields first, then adapter required fields not already covered
      const adapterRequired = context?.requiredFields ?? []
      const siblingKeys = new Set(inferredFields.map((f) => f.name))
      const extraAdapterFields = adapterRequired.filter((f) => !siblingKeys.has(f.name))
      const allFields = [...inferredFields, ...extraAdapterFields]

      setSiblingFields(allFields)
      setFieldValues(Object.fromEntries(allFields.map((f) => [f.name, blankValue(f)])))
      setReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [open, context, branch, folderChildNodes, owner, repo]) // context must be listed: effect reads context?.requiredFields

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const fileName = deriveFilename({
      title: title.trim(),
      strategy: context.namingStrategy,
      extension: context.fileExtension,
      existingNames: folderChildren,
    })

    const frontmatter: Record<string, unknown> = {
      title: title.trim(),
      ...fieldValues,
    }

    onConfirm({ fileName, parentPath, frontmatter })
    onOpenChange(false)
  }

  const contentLabel = context.contentLabel
  const primaryFieldLabel = context.primaryFieldLabel
  const hint = context.hint

  // Skeleton field count: show 2 placeholder rows while loading
  const skeletonFieldCount = 2

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg p-0">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <SheetHeader className="px-6 pt-6 pb-4">
            <SheetTitle>New {contentLabel}</SheetTitle>
            <SheetDescription>
              {displayPath ? `Adding to ${displayPath}` : "Adding to the content root"}
            </SheetDescription>
            {hint && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md mt-2 border border-amber-200 dark:border-amber-800">
                <span className="font-medium">Note:</span> {hint}
              </p>
            )}
          </SheetHeader>

          {!ready ? (
            /* Skeleton phase — shown until sibling fetch + timer both resolve */
            <div className="px-6 py-4 space-y-4">
              <div className="grid gap-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-full" />
              </div>
              {Array.from({ length: skeletonFieldCount }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Skeletons are identical placeholders
                <div key={`skeleton-field-placeholder-${i}`} className="grid gap-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <ScrollArea className="flex-1 px-6">
              <div className="py-4 space-y-6">
                {/* Title — always first */}
                <div className="grid gap-2">
                  <Label htmlFor="smart-create-title" className="font-semibold text-sm">
                    {primaryFieldLabel}
                    <span className="text-muted-foreground font-normal ml-1 text-xs">(required)</span>
                  </Label>
                  <Input
                    id="smart-create-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={`Enter ${primaryFieldLabel.toLowerCase()}…`}
                    className="h-10"
                    autoFocus
                  />
                </div>

                {/* Inferred + required fields — grouped with section headers */}
                {groupFields(siblingFields).map((grouped) => (
                  <div key={grouped.group}>
                    {/* Section header */}
                    <div className="text-xs font-semibold text-studio-fg-muted uppercase tracking-wider mb-3 pb-2 border-b border-studio-border">
                      {grouped.groupLabel}
                    </div>
                    {/* Fields in this group */}
                    <div className="space-y-4">
                      {grouped.fields.map((field) => (
                        <FrontmatterField
                          key={field.name}
                          field={toMergedField(field)}
                          value={fieldValues[field.name]}
                          onChange={(val) =>
                            setFieldValues((prev) => ({
                              ...prev,
                              [field.name]: val,
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <SheetFooter className="px-6 pb-6 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || !title.trim()}>
              Create
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
