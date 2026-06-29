"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Box, ChevronDown, ChevronLeft, Code, FileText, Image, Layout, Search, X } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ALL_CATEGORIES,
  buildComponentCatalog,
  type ComponentCategory,
  deriveCategory,
  getComponentLabel,
} from "@/lib/studio/component-catalog"
import { buildComponentNode, type ComponentNode } from "@/lib/studio/component-node"
import type { RepoComponentDef } from "@/lib/studio/component-registry"
import { buildComponentRegistry } from "@/lib/studio/component-registry"
import { serializeComponentNode } from "@/lib/studio/component-serializer"
import { resolveStudioAssetUrl } from "@/lib/studio/media-resolve"
import { cn } from "@/lib/utils"
import { ComponentPreview } from "./component-preview"
import { ComponentPropForm, type PropFormState, validateFormState } from "./component-prop-form"
import { useStudio } from "./studio-context"
import { VideoPreview as StudioVideoPreview } from "./video-preview"

// ---------------------------------------------------------------------------
// LiveConfigurePreview - reacts to formState for known component types
// ---------------------------------------------------------------------------

function LiveConfigurePreview({ def, formState }: { def: RepoComponentDef; formState: PropFormState }) {
  const studio = useStudio()
  const normalizedName = def.name.replace(/Adapter$/i, "").toLowerCase()

  // DocsImage / image component - show actual image when src is provided
  if (
    (normalizedName === "docsimage" || normalizedName === "image") &&
    typeof formState.src === "string" &&
    formState.src
  ) {
    const resolvedSrc = resolveStudioAssetUrl(
      formState.src as string,
      studio.projectId,
      studio.userId,
      studio.selectedFilePath,
      studio.projectAccessToken,
      studio.contentRoot,
    )
    return (
      <div className="w-full flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={resolvedSrc}
          src={resolvedSrc}
          alt={typeof formState.alt === "string" ? formState.alt : "Preview"}
          className="w-full h-auto max-h-56 object-contain rounded-lg"
        />
        {typeof formState.alt === "string" && formState.alt && (
          <p className="text-xs text-studio-fg-muted text-center italic">{formState.alt}</p>
        )}
        {typeof formState.caption === "string" && formState.caption && (
          <p className="text-xs text-studio-fg/60 text-center">{formState.caption}</p>
        )}
      </div>
    )
  }

  // DocsVideo / video component - show actual embedded player
  if (
    (normalizedName === "docsvideo" || normalizedName === "video") &&
    typeof formState.src === "string" &&
    formState.src
  ) {
    return (
      <div className="w-full max-w-sm space-y-3">
        <div className="w-full aspect-video rounded-lg border border-studio-border overflow-hidden bg-studio-canvas-inset">
          <StudioVideoPreview url={formState.src} className="w-full h-full rounded-lg" />
        </div>
        {typeof formState.title === "string" && formState.title && (
          <p className="text-xs font-medium text-studio-fg text-center">{formState.title}</p>
        )}
      </div>
    )
  }

  // Callout - show a styled live callout preview
  if (normalizedName === "callout") {
    const type = typeof formState.type === "string" ? formState.type : "info"
    const title = typeof formState.title === "string" ? formState.title : ""

    const typeStyles: Record<string, { bg: string; border: string; icon: string }> = {
      info: { bg: "bg-studio-accent/5", border: "border-studio-accent/20", icon: "ℹ" },
      warning: { bg: "bg-studio-attention/5", border: "border-studio-attention/20", icon: "⚠" },
      error: { bg: "bg-studio-danger/5", border: "border-studio-danger/20", icon: "✕" },
      tip: { bg: "bg-studio-success/5", border: "border-studio-success/20", icon: "✓" },
    }
    const s = typeStyles[type] ?? typeStyles.info

    return (
      <div className={cn("w-full max-w-sm rounded-lg border p-4 space-y-2", s.bg, s.border)}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{s.icon}</span>
          <p className="text-xs font-medium text-studio-fg">{title || type.charAt(0).toUpperCase() + type.slice(1)}</p>
        </div>
        <div className="space-y-1.5 pl-5">
          <div className="w-full h-1.5 rounded-full bg-studio-fg/10" />
          <div className="w-4/5 h-1.5 rounded-full bg-studio-fg/10" />
          <div className="w-3/5 h-1.5 rounded-full bg-studio-fg/10" />
        </div>
      </div>
    )
  }

  // Default fallback - static wireframe preview
  return <ComponentPreview name={def.name} className="shadow-none border-none bg-transparent" />
}

// ---------------------------------------------------------------------------
// Recently-used localStorage helpers
// ---------------------------------------------------------------------------

const RECENT_KEY = "repopress:recent-components"
const MAX_RECENT = 5

function getRecentComponents(): string[] {
  if (typeof window === "undefined") return []
  try {
    const stored = localStorage.getItem(RECENT_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function addRecentComponent(name: string): void {
  try {
    const recent = getRecentComponents().filter((n) => n !== name)
    recent.unshift(name)
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
  } catch {
    // localStorage unavailable
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComponentInsertModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Adapter-discovered components. */
  adapterComponents?: Record<string, any> | null
  /** Project config components (from repopress.config.json). */
  projectComponents?: Record<string, any> | null
  /** Detected framework (e.g. "fumadocs", "nextra", "astro") - used for fallback component schemas. */
  framework?: string
  /** Optional repo context for image uploads in prop form. */
  repoContext?: {
    projectId: string
    userId?: string
    owner: string
    repo: string
    branch: string
    selectedFilePath?: string
  }
  /** Called with serialized JSX, component metadata, and the resolved node when user confirms insert. */
  onInsert: (jsx: string, def: RepoComponentDef, node: ComponentNode) => void
}

// ---------------------------------------------------------------------------
// Modal states
// ---------------------------------------------------------------------------

type ModalStep = "pick" | "configure"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Two-step modal for component insertion:
 * 1. **Pick** - choose a component from the catalog.
 * 2. **Configure** - fill in props (and optional children), then insert.
 *
 * The registry is built on each open from adapter + project components
 * (single source of truth). Catalog is a read-only projection.
 *
 * Insert flow:
 *   form state → ComponentNode → serializer → onInsert callback
 */
export function ComponentInsertModal({
  open,
  onOpenChange,
  adapterComponents,
  projectComponents,
  framework,
  repoContext,
  onInsert,
}: ComponentInsertModalProps) {
  // -- Registry & catalog (recomputed when inputs change) --
  const registry = React.useMemo(
    () => buildComponentRegistry(adapterComponents, projectComponents, framework),
    [adapterComponents, projectComponents, framework],
  )
  const catalog = React.useMemo(() => {
    const hasProjectComponents = !!projectComponents && Object.keys(projectComponents).length > 0
    return buildComponentCatalog(registry, { hasProjectComponents })
  }, [registry, projectComponents])

  // -- Modal state --
  const [step, setStep] = React.useState<ModalStep>("pick")
  const [selectedDef, setSelectedDef] = React.useState<RepoComponentDef | null>(null)
  const [formState, setFormState] = React.useState<PropFormState>({})
  const [searchQuery, setSearchQuery] = React.useState("")
  const [activeCategory, setActiveCategory] = React.useState<ComponentCategory | "All">("All")

  // -- Recently-used components --
  const [recentNames, setRecentNames] = React.useState<string[]>([])

  const recentCatalog = React.useMemo(() => {
    if (!catalog) return []
    return recentNames
      .map((name) => catalog.find((c) => c.name === name))
      .filter((c): c is RepoComponentDef => c !== undefined)
  }, [recentNames, catalog])

  // Real-time validation for the configure step
  const formErrors = React.useMemo(() => {
    if (!selectedDef) return {}
    return validateFormState(selectedDef.props, formState)
  }, [selectedDef, formState])
  const hasErrors = Object.keys(formErrors).length > 0

  // -- JSX preview (reuses the same pipeline as handleInsert) --
  const [showPreview, setShowPreview] = React.useState(false)

  const jsxPreview = React.useMemo(() => {
    if (!selectedDef) return ""
    try {
      const node = buildComponentNode(selectedDef, formState)
      return serializeComponentNode(node)
    } catch {
      return ""
    }
  }, [selectedDef, formState])

  // Filtered catalog
  const filteredCatalog = React.useMemo(() => {
    let result = catalog
    if (activeCategory !== "All") {
      result = result.filter((def) => deriveCategory(def) === activeCategory)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (def) =>
          getComponentLabel(def).toLowerCase().includes(q) ||
          def.name.toLowerCase().includes(q) ||
          def.description?.toLowerCase().includes(q),
      )
    }
    return result
  }, [catalog, searchQuery, activeCategory])

  // Main catalog - excludes recently-used items when the recently-used section
  // is visible, so components don't appear in both sections simultaneously.
  const mainCatalog = React.useMemo(() => {
    if (recentCatalog.length === 0 || searchQuery || activeCategory !== "All") {
      return filteredCatalog
    }
    const recentNameSet = new Set(recentCatalog.map((c) => c.name))
    return filteredCatalog.filter((c) => !recentNameSet.has(c.name))
  }, [filteredCatalog, recentCatalog, searchQuery, activeCategory])

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (open) {
      setStep("pick")
      setSelectedDef(null)
      setFormState({})
      setSearchQuery("")
      setActiveCategory("All")
      setShowPreview(false)
      setRecentNames(getRecentComponents())
    }
  }, [open])

  // -- Handlers --
  const handleSelectComponent = React.useCallback(
    (def: RepoComponentDef) => {
      setSelectedDef(def)
      // Pre-populate with defaults
      const defaults: PropFormState = {}
      for (const prop of def.props) {
        if (prop.default !== undefined) {
          defaults[prop.name] = prop.default
        }
      }
      setFormState(defaults)

      // If no configurable props and no children, insert immediately
      if (def.props.length === 0 && !def.hasChildren) {
        const node = buildComponentNode(def, defaults)
        const jsx = serializeComponentNode(node)
        addRecentComponent(def.name)
        onInsert(jsx, def, node)
        onOpenChange(false)
        return
      }

      setStep("configure")
    },
    [onInsert, onOpenChange],
  )

  const handleInsert = React.useCallback(() => {
    if (!selectedDef) {
      console.warn("handleInsert called but no selectedDef")
      return
    }
    try {
      const node = buildComponentNode(selectedDef, formState)
      const jsx = serializeComponentNode(node)
      addRecentComponent(selectedDef.name)
      onInsert(jsx, selectedDef, node)
      onOpenChange(false)
    } catch (error) {
      console.error("Error in handleInsert:", error)
      throw error
    }
  }, [selectedDef, formState, onInsert, onOpenChange])

  const handleBack = React.useCallback(() => {
    setStep("pick")
    setSelectedDef(null)
    setFormState({})
    setShowPreview(false)
  }, [])

  // -- Render --
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden gap-0 border-studio-border bg-studio-canvas shadow-2xl"
      >
        <AnimatePresence mode="wait">
          {step === "pick" ? (
            <motion.div
              key="pick"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0 relative"
            >
              <div className="px-6 pt-5 pb-4 border-b border-studio-border shrink-0">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <DialogTitle className="text-xl font-semibold tracking-tight text-studio-fg">
                      Insert Component
                    </DialogTitle>
                    <DialogDescription className="text-xs text-studio-fg-muted mt-0.5">
                      Extend your document with a reusable component
                    </DialogDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 -mt-0.5 -mr-1 text-studio-fg-muted hover:text-studio-fg"
                    onClick={() => onOpenChange(false)}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-studio-fg-muted pointer-events-none" />
                  <Input
                    placeholder="Search components..."
                    className="h-10 pl-11 pr-4 text-sm bg-studio-canvas-inset border-studio-border rounded-lg focus:border-studio-accent focus:ring-1 focus:ring-studio-accent/30"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 px-6 py-2.5 border-b border-studio-border/60 shrink-0 overflow-x-auto">
                {(["All", ...ALL_CATEGORIES] as const).map((cat) => {
                  const catStyle = cat !== "All" ? categoryStyles[cat as keyof typeof categoryStyles] : null
                  const CatIcon = catStyle?.icon ?? null
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-150 whitespace-nowrap shrink-0",
                        activeCategory === cat
                          ? "bg-studio-accent text-white shadow-sm border border-studio-accent"
                          : "text-studio-fg hover:text-studio-accent hover:bg-studio-canvas-inset",
                      )}
                    >
                      {CatIcon && <CatIcon className="h-3 w-3 shrink-0" />}
                      {cat}
                    </button>
                  )
                })}
              </div>

              <ScrollArea className="flex-1 px-6 py-5 min-h-0">
                {recentCatalog.length > 0 && !searchQuery && activeCategory === "All" && (
                  <div className="mb-5">
                    <h4 className="text-[10px] font-medium uppercase tracking-widest text-studio-fg/35 mb-3 px-1 select-none">
                      Recently used
                    </h4>
                    <CatalogGallery catalog={recentCatalog} onSelect={handleSelectComponent} />
                  </div>
                )}
                {/* Suppress main grid when all components are already shown in Recently used */}
                {(mainCatalog.length > 0 || recentCatalog.length === 0 || searchQuery || activeCategory !== "All") && (
                  <>
                    {recentCatalog.length > 0 && !searchQuery && activeCategory === "All" && mainCatalog.length > 0 && (
                      <h4 className="text-[10px] font-medium uppercase tracking-widest text-studio-fg/35 mb-3 px-1 select-none">
                        All components
                      </h4>
                    )}
                    <CatalogGallery catalog={mainCatalog} onSelect={handleSelectComponent} />
                  </>
                )}
              </ScrollArea>
            </motion.div>
          ) : (
            <motion.div
              key="configure"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="px-6 py-4 border-b border-studio-border shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBack}
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                      "border border-studio-border text-studio-fg-muted",
                      "hover:bg-studio-accent-muted hover:border-studio-accent/30 hover:text-studio-accent",
                      "transition-all duration-150",
                    )}
                    aria-label="Back to component list"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <DialogTitle className="text-base font-semibold text-studio-fg truncate">
                        {selectedDef ? getComponentLabel(selectedDef) : "Configure"}
                      </DialogTitle>
                      {selectedDef && selectedDef.props.length > 0 && (
                        <span className="shrink-0 inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-studio-accent/10 text-studio-accent border border-studio-accent/15">
                          {selectedDef.props.length} prop{selectedDef.props.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {selectedDef?.description && (
                      <p className="text-[11px] text-studio-fg-muted mt-0.5 truncate">{selectedDef.description}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left panel - live preview */}
                <div className="hidden md:flex flex-1 items-center justify-center p-10 border-r border-studio-border bg-studio-canvas-inset/20 relative overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06] pointer-events-none"
                    style={{
                      backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
                      backgroundSize: "20px 20px",
                    }}
                  />
                  <div className="relative z-10 w-full max-w-xs flex items-center justify-center">
                    {selectedDef && (
                      <motion.div
                        key={selectedDef.name}
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="w-full flex items-center justify-center p-4"
                      >
                        <LiveConfigurePreview def={selectedDef} formState={formState} />
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Right panel - form */}
                <div className="w-full md:w-[360px] flex flex-col min-h-0">
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="p-5 space-y-5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[10px] font-medium uppercase tracking-widest text-studio-fg/35 select-none">
                          Properties
                        </h4>
                        <div className="flex-1 h-px bg-studio-border-muted/60" />
                      </div>
                      {selectedDef && (
                        <ComponentPropForm
                          def={selectedDef}
                          formState={formState}
                          onFormChange={setFormState}
                          repoContext={repoContext}
                          errors={formErrors}
                        />
                      )}
                    </div>
                  </ScrollArea>

                  {/* Collapsible JSX Preview */}
                  <div className="px-5 py-4 border-t border-studio-border/60 bg-studio-canvas-inset/40">
                    <button
                      type="button"
                      onClick={() => setShowPreview(!showPreview)}
                      className="flex items-center gap-1.5 text-[12px] font-medium text-studio-fg-muted hover:text-studio-fg transition-colors group"
                      title="Preview the generated JSX code"
                    >
                      <Code className="h-4 w-4 transition-colors group-hover:text-studio-accent" />
                      {showPreview ? "Hide" : "Show"} JSX Preview
                      <ChevronDown className={cn("h-3 w-3 transition-transform", showPreview && "rotate-180")} />
                    </button>
                    {showPreview && (
                      <pre className="mt-3 p-4 bg-studio-canvas rounded-lg text-[11px] font-mono overflow-x-auto border border-studio-border shadow-sm">
                        <code className="text-studio-fg/80">{jsxPreview}</code>
                      </pre>
                    )}
                  </div>

                  <div className="p-4 border-t border-studio-border space-y-3 shrink-0">
                    {hasErrors && (
                      <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                        <p className="font-medium">Please fill all required fields before inserting.</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className="text-xs text-studio-fg-muted hover:text-studio-fg h-9"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleInsert}
                        disabled={hasErrors}
                        size="sm"
                        className={cn(
                          "h-9 px-6 text-xs font-semibold tracking-wide",
                          hasErrors ? "opacity-50 cursor-not-allowed" : "shadow-sm",
                        )}
                        title={hasErrors ? "Fill all required fields" : "Insert this component"}
                      >
                        Insert Component
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Catalog gallery sub-component
// ---------------------------------------------------------------------------

const categoryStyles = {
  Media: {
    icon: Image,
    bg: "bg-studio-accent-muted",
    iconColor: "text-studio-accent",
    border: "border-studio-accent/20",
  },
  Content: {
    icon: FileText,
    bg: "bg-studio-success-muted",
    iconColor: "text-studio-success",
    border: "border-studio-success/20",
  },
  Layout: {
    icon: Layout,
    bg: "bg-studio-attention-muted",
    iconColor: "text-studio-attention",
    border: "border-studio-attention/20",
  },
  Custom: {
    icon: Box,
    bg: "bg-studio-danger-muted",
    iconColor: "text-studio-danger",
    border: "border-studio-danger/20",
  },
} as const

function ComponentCard({ def, onSelect }: { def: RepoComponentDef; onSelect: (def: RepoComponentDef) => void }) {
  const category = deriveCategory(def)
  const label = getComponentLabel(def)
  const style = categoryStyles[category]
  const Icon = style.icon

  return (
    <button
      type="button"
      onClick={() => onSelect(def)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left outline-none cursor-pointer",
        "hover:bg-studio-canvas-inset",
        "transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-studio-accent focus-visible:ring-offset-1",
      )}
    >
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border", style.bg, style.border)}>
        <Icon className={cn("h-4 w-4", style.iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-studio-fg leading-tight">{label}</p>
        {def.description && <p className="truncate text-[11px] text-studio-fg-muted leading-snug">{def.description}</p>}
      </div>
      {def.props.length > 0 && (
        <span className="shrink-0 rounded-sm bg-studio-canvas-inset px-1.5 py-0.5 text-[10px] font-medium text-studio-fg/40">
          {def.props.length}p
        </span>
      )}
    </button>
  )
}

function CatalogGallery({
  catalog,
  onSelect,
}: {
  catalog: RepoComponentDef[]
  onSelect: (def: RepoComponentDef) => void
}) {
  if (catalog.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Box className="h-8 w-8 text-studio-fg/20 mb-3" />
        <p className="text-sm text-studio-fg-muted">No components found</p>
        <p className="text-xs text-studio-fg-muted/60 mt-1">Try a different search term or check your config.</p>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {catalog.map((def) => (
        <ComponentCard key={def.name} def={def} onSelect={onSelect} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preview component wrapper (local for type safety if needed)
// ---------------------------------------------------------------------------
