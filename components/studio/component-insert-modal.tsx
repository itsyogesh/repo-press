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
import { cn } from "@/lib/utils"
import { ComponentPreview } from "./component-preview"
import { ComponentPropForm, type PropFormState, validateFormState } from "./component-prop-form"
import { VideoPreview as StudioVideoPreview } from "./video-preview"

// ---------------------------------------------------------------------------
// LiveConfigurePreview — reacts to formState for known component types
// ---------------------------------------------------------------------------

function LiveConfigurePreview({ def, formState }: { def: RepoComponentDef; formState: PropFormState }) {
  const normalizedName = def.name.replace(/Adapter$/i, "").toLowerCase()

  // DocsImage / image component — show actual image when src is provided
  if (
    (normalizedName === "docsimage" || normalizedName === "image") &&
    typeof formState.src === "string" &&
    formState.src
  ) {
    return (
      <div className="w-full max-w-sm flex flex-col items-center gap-3">
        <div className="w-full rounded-xl border border-studio-border overflow-hidden bg-studio-canvas-inset">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={formState.src as string}
            src={formState.src}
            alt={typeof formState.alt === "string" ? formState.alt : "Preview"}
            className="w-full h-auto max-h-64 object-contain"
          />
        </div>
        {typeof formState.alt === "string" && formState.alt && (
          <p className="text-xs text-studio-fg-muted text-center italic">{formState.alt}</p>
        )}
        {typeof formState.caption === "string" && formState.caption && (
          <p className="text-xs text-studio-fg/60 text-center">{formState.caption}</p>
        )}
      </div>
    )
  }

  // DocsVideo / video component — show actual embedded player
  if (
    (normalizedName === "docsvideo" || normalizedName === "video") &&
    typeof formState.src === "string" &&
    formState.src
  ) {
    return (
      <div className="w-full max-w-sm space-y-3">
        <div className="w-full aspect-video rounded-xl border border-studio-border overflow-hidden bg-studio-canvas-inset">
          <StudioVideoPreview url={formState.src} className="w-full h-full rounded-xl" />
        </div>
        {typeof formState.title === "string" && formState.title && (
          <p className="text-xs font-medium text-studio-fg text-center">{formState.title}</p>
        )}
      </div>
    )
  }

  // Callout — show a styled live callout preview
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
      <div className={cn("w-full max-w-sm rounded-xl border p-4 space-y-2", s.bg, s.border)}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{s.icon}</span>
          <p className="text-xs font-semibold text-studio-fg">
            {title || type.charAt(0).toUpperCase() + type.slice(1)}
          </p>
        </div>
        <div className="space-y-1.5 pl-5">
          <div className="w-full h-1.5 rounded-full bg-studio-fg/10" />
          <div className="w-4/5 h-1.5 rounded-full bg-studio-fg/10" />
          <div className="w-3/5 h-1.5 rounded-full bg-studio-fg/10" />
        </div>
      </div>
    )
  }

  // Default fallback — static wireframe preview
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
  /** Detected framework (e.g. "fumadocs", "nextra", "astro") — used for fallback component schemas. */
  framework?: string
  /** Optional repo context for image uploads in prop form. */
  repoContext?: {
    projectId: string
    userId?: string
    owner: string
    repo: string
    branch: string
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
 * 1. **Pick** — choose a component from the catalog.
 * 2. **Configure** — fill in props (and optional children), then insert.
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

  // Main catalog — excludes recently-used items when the recently-used section
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
              <div className="p-5 border-b border-studio-border bg-studio-canvas-inset/30 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <DialogTitle className="text-lg font-bold tracking-tight text-studio-fg">
                      Insert Component
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      Select a component to extend your document.
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-[280px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-studio-fg-muted" />
                      <Input
                        placeholder="Search..."
                        className="h-8 pl-8 pr-3 text-xs bg-studio-canvas border-studio-border-muted focus:ring-1 focus:ring-studio-accent/50"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => onOpenChange(false)}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Close</span>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 px-5 py-2 border-b border-studio-border bg-studio-canvas">
                {(["All", ...ALL_CATEGORIES] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                      activeCategory === cat
                        ? "bg-studio-accent text-white"
                        : "bg-studio-canvas-inset text-studio-fg-muted hover:text-studio-fg",
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <ScrollArea className="flex-1 px-5 py-5 min-h-0">
                {recentCatalog.length > 0 && !searchQuery && activeCategory === "All" && (
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">Recently used</h4>
                    <CatalogGallery catalog={recentCatalog} onSelect={handleSelectComponent} />
                  </div>
                )}
                {/* Suppress main grid when all components are already shown in Recently used */}
                {(mainCatalog.length > 0 || recentCatalog.length === 0 || searchQuery || activeCategory !== "All") && (
                  <>
                    {recentCatalog.length > 0 && !searchQuery && activeCategory === "All" && mainCatalog.length > 0 && (
                      <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">All components</h4>
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
              <div className="p-4 border-b border-studio-border bg-studio-canvas-inset/50 shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="rounded-md p-1.5 hover:bg-studio-accent-muted text-studio-fg-muted hover:text-studio-accent transition-all border border-transparent hover:border-studio-accent/20"
                    aria-label="Back to component list"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <DialogTitle className="text-base font-bold truncate">
                      {selectedDef ? getComponentLabel(selectedDef) : "Configure"}
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono text-studio-fg-muted opacity-60">
                        &lt;{selectedDef?.name} /&gt;
                      </span>
                      {selectedDef?.description && (
                        <>
                          <span className="text-studio-border-muted">•</span>
                          <span className="text-[10px] text-studio-fg-muted truncate">{selectedDef.description}</span>
                        </>
                      )}
                      {selectedDef?.props && selectedDef.props.length > 0 && (
                        <>
                          <span className="text-studio-border-muted">•</span>
                          <span className="text-[10px] font-medium text-studio-accent">
                            {selectedDef.props.length} prop{selectedDef.props.length !== 1 ? "s" : ""}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden min-h-0 bg-studio-canvas">
                {/* Visual Preview Area - Subtle and technical */}
                <div className="hidden md:flex flex-1 items-center justify-center p-8 border-r border-studio-border bg-studio-canvas-inset/10 relative overflow-hidden">
                  <div className="absolute inset-0 bg-grid-small-black/[0.02] dark:bg-grid-small-white/[0.02] pointer-events-none" />
                  <div className="w-full max-w-sm aspect-video relative z-10 flex items-center justify-center border border-dashed border-studio-border-muted rounded-xl bg-studio-canvas/50">
                    {selectedDef && (
                      <div className="transition-transform duration-500 flex items-center justify-center p-4 w-full">
                        <LiveConfigurePreview def={selectedDef} formState={formState} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full md:w-[380px] flex flex-col min-h-0 border-l border-studio-border shadow-[inset_1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[inset_1px_0_0_0_rgba(255,255,255,0.02)]">
                  <ScrollArea className="flex-1 p-5 min-h-0">
                    <div className="space-y-6">
                      <div className="space-y-1">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-studio-fg/40">Properties</h4>
                        <div className="h-px bg-studio-border-muted/50 w-full" />
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
                  <div className="px-5 py-3 border-t border-studio-border">
                    <button
                      type="button"
                      onClick={() => setShowPreview(!showPreview)}
                      className="flex items-center gap-1.5 text-xs text-studio-fg-muted hover:text-studio-fg transition-colors"
                    >
                      <Code className="h-3.5 w-3.5" />
                      {showPreview ? "Hide" : "Show"} JSX preview
                      <ChevronDown className={cn("h-3 w-3 transition-transform", showPreview && "rotate-180")} />
                    </button>
                    {showPreview && (
                      <pre className="mt-2 p-3 bg-studio-canvas-inset rounded-md text-xs font-mono overflow-x-auto border border-studio-border-muted">
                        <code>{jsxPreview}</code>
                      </pre>
                    )}
                  </div>

                  <div className="p-4 border-t border-studio-border bg-studio-canvas-inset/30 flex items-center justify-between gap-3 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs h-8">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleInsert}
                      disabled={hasErrors}
                      className={cn(
                        "h-8 px-5 rounded-md text-[11px] font-bold uppercase tracking-wider shadow-sm",
                        hasErrors && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      Insert
                    </Button>
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
      className="group flex flex-col gap-3 p-3.5 rounded-xl border border-studio-border bg-studio-canvas hover:border-studio-accent/40 hover:bg-studio-canvas-inset/50 transition-all duration-150 text-left outline-none focus-visible:ring-2 focus-visible:ring-studio-accent"
    >
      <div className={cn("w-10 h-10 rounded-lg border flex items-center justify-center", style.bg, style.border)}>
        <Icon className={cn("h-5 w-5", style.iconColor)} />
      </div>
      <div className="space-y-0.5 min-w-0">
        <p className="text-xs font-semibold text-studio-fg leading-tight truncate">{label}</p>
        {def.description && (
          <p className="text-[11px] text-studio-fg-muted leading-snug line-clamp-2">{def.description}</p>
        )}
        <p className="text-[10px] text-studio-fg/30 mt-1">
          {def.props.length} {def.props.length === 1 ? "prop" : "props"}
        </p>
      </div>
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
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {catalog.map((def) => (
        <ComponentCard key={def.name} def={def} onSelect={onSelect} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preview component wrapper (local for type safety if needed)
// ---------------------------------------------------------------------------
