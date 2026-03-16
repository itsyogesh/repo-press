"use client"

import matter from "gray-matter"
import { DraftingCompass } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import type { MergedFieldDef } from "@/lib/framework-adapters"
import { deriveFilename } from "@/lib/framework-adapters/derive-filename"
import { groupFields } from "@/lib/framework-adapters/field-groups"
import { getFolderContext } from "@/lib/framework-adapters/folder-context"
import type { FrameworkAdapter, FrontmatterFieldDef } from "@/lib/framework-adapters/types"
import type { FileTreeNode } from "@/lib/github"
import {
  blankSmartCreateValue,
  buildSiblingFields,
  findSiblingContentFile,
  resolveSmartCreateExtension,
} from "@/lib/studio/smart-create"
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

// ─── Component ───────────────────────────────────────────────────────────────

const MIN_SKELETON_MS = 120

type SiblingInferenceSnapshot = {
  status: "idle" | "loading" | "ready" | "error"
  fields: FrontmatterFieldDef[]
}

type SiblingInferenceEntry = {
  snapshot: SiblingInferenceSnapshot
  listeners: Set<() => void>
  promise: Promise<void> | null
}

const EMPTY_SIBLING_SNAPSHOT: SiblingInferenceSnapshot = {
  status: "idle",
  fields: [],
}

const siblingInferenceStore = new Map<string, SiblingInferenceEntry>()

function getSiblingInferenceEntry(key: string) {
  let entry = siblingInferenceStore.get(key)
  if (!entry) {
    entry = {
      snapshot: EMPTY_SIBLING_SNAPSHOT,
      listeners: new Set(),
      promise: null,
    }
    siblingInferenceStore.set(key, entry)
  }
  return entry
}

function emitSiblingInference(entry: SiblingInferenceEntry) {
  for (const listener of entry.listeners) {
    listener()
  }
}

async function loadSiblingInference(
  key: string,
  payload: { owner: string; repo: string; branch: string; path: string },
) {
  const entry = getSiblingInferenceEntry(key)
  if (entry.promise || entry.snapshot.status === "ready") return

  entry.snapshot = { status: "loading", fields: [] }
  emitSiblingInference(entry)

  entry.promise = fetchSiblingFrontmatter(payload.owner, payload.repo, payload.branch, payload.path)
    .then((frontmatter) => {
      entry.snapshot = {
        status: "ready",
        fields: frontmatter ? buildSiblingFields(frontmatter) : [],
      }
    })
    .catch(() => {
      entry.snapshot = { status: "error", fields: [] }
    })
    .finally(() => {
      entry.promise = null
      emitSiblingInference(entry)
    })
}

function subscribeSiblingInference(
  key: string | null,
  payload: { owner: string; repo: string; branch: string; path: string } | null,
  listener: () => void,
) {
  if (!key || !payload) return () => {}

  const entry = getSiblingInferenceEntry(key)
  entry.listeners.add(listener)
  void loadSiblingInference(key, payload)

  return () => {
    entry.listeners.delete(listener)
  }
}

function getSiblingInferenceSnapshot(key: string | null): SiblingInferenceSnapshot {
  if (!key) return EMPTY_SIBLING_SNAPSHOT
  return getSiblingInferenceEntry(key).snapshot
}

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

  const sibling = React.useMemo(() => findSiblingContentFile(folderChildNodes), [folderChildNodes])

  const siblingInferenceKey = React.useMemo(() => {
    if (!open || !sibling) return null
    return JSON.stringify({
      owner,
      repo,
      branch,
      path: sibling.path,
    })
  }, [open, owner, repo, branch, sibling?.path])

  const siblingSnapshot = React.useSyncExternalStore(
    (listener) =>
      subscribeSiblingInference(
        siblingInferenceKey,
        sibling
          ? {
              owner,
              repo,
              branch,
              path: sibling.path,
            }
          : null,
        listener,
      ),
    () => getSiblingInferenceSnapshot(siblingInferenceKey),
    () => EMPTY_SIBLING_SNAPSHOT,
  )

  // Compute display path (strip contentRoot prefix)
  const displayPath = React.useMemo(() => {
    if (contentRoot && parentPath.startsWith(contentRoot)) {
      return parentPath.slice(contentRoot.length).replace(/^\//, "")
    }
    return parentPath
  }, [parentPath, contentRoot])

  React.useEffect(() => {
    if (!open) return undefined
    setTitle("")
    setSiblingFields([])
    setFieldValues({})
    setReady(false)
    return undefined
  }, [open, parentPath, owner, repo, branch])

  React.useEffect(() => {
    if (!open) return undefined

    const siblingResolved = !sibling || siblingSnapshot.status === "ready" || siblingSnapshot.status === "error"
    if (!siblingResolved) return undefined

    const inferredFields = sibling ? siblingSnapshot.fields : []
    const siblingKeys = new Set(inferredFields.map((field) => field.name))
    const extraAdapterFields = context.requiredFields.filter((field) => !siblingKeys.has(field.name))
    const allFields = [...inferredFields, ...extraAdapterFields]

    setSiblingFields(allFields)
    setFieldValues((previous) => {
      if (Object.keys(previous).length > 0) return previous
      return Object.fromEntries(allFields.map((field) => [field.name, blankSmartCreateValue(field)]))
    })

    const timer = window.setTimeout(() => {
      setReady(true)
    }, MIN_SKELETON_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [open, sibling?.path, siblingSnapshot.status, siblingSnapshot.fields, context.requiredFields])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const extension = resolveSmartCreateExtension({
      adapter,
      siblingPath: sibling?.path,
    })

    const fileName = deriveFilename({
      title: title.trim(),
      strategy: context.namingStrategy,
      extension,
      existingNames: folderChildren,
    })

    const frontmatter = Object.fromEntries([
      ["title", title.trim()],
      ...Object.entries(fieldValues).filter(([, value]) => value !== undefined),
    ])

    onConfirm({ fileName, parentPath, frontmatter })
    onOpenChange(false)
  }

  const contentLabel = context.contentLabel
  const primaryFieldLabel = context.primaryFieldLabel
  const hint = context.hint

  // Skeleton field count: show 2 placeholder rows while loading
  const skeletonFieldCount = 2

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (!newOpen) {
      // Force immediate restoration of interaction on close
      document.body.style.pointerEvents = "auto"
      document.body.style.overflow = ""
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="relative overflow-hidden flex flex-col w-full sm:max-w-lg p-0">
        <DraftingCompass
          className="absolute bottom-[-10%] right-[-10%] w-96 h-96 text-foreground opacity-[0.03] pointer-events-none transition-opacity duration-1000"
          aria-hidden="true"
        />
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <SheetHeader className="px-6 pt-6 pb-4">
            <SheetTitle>New {contentLabel}</SheetTitle>
            <SheetDescription>
              {displayPath ? `Adding to ${displayPath}` : "Adding to the content root"}
            </SheetDescription>
            {hint && (
              <p className="mt-2 rounded-md border border-studio-attention/30 bg-studio-attention/10 px-3 py-2 text-xs text-studio-attention">
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

          <SheetFooter className="flex-row px-6 pb-6 pt-4 border-t border-studio-border justify-end">
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
