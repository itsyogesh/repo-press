"use client"

import { AnimatePresence, motion, type Variants } from "framer-motion"
import { ChevronLeft, Search } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { buildComponentCatalog, getComponentLabel } from "@/lib/studio/component-catalog"
import { buildComponentNode, type ComponentNode } from "@/lib/studio/component-node"
import type { RepoComponentDef } from "@/lib/studio/component-registry"
import { buildComponentRegistry } from "@/lib/studio/component-registry"
import { serializeComponentNode } from "@/lib/studio/component-serializer"
import { ComponentPreview } from "./component-preview"
import { ComponentPropForm, type PropFormState } from "./component-prop-form"

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
  repoContext,
  onInsert,
}: ComponentInsertModalProps) {
  // -- Registry & catalog (recomputed when inputs change) --
  const registry = React.useMemo(
    () => buildComponentRegistry(adapterComponents, projectComponents),
    [adapterComponents, projectComponents],
  )
  const catalog = React.useMemo(() => buildComponentCatalog(registry), [registry])

  // -- Modal state --
  const [step, setStep] = React.useState<ModalStep>("pick")
  const [selectedDef, setSelectedDef] = React.useState<RepoComponentDef | null>(null)
  const [formState, setFormState] = React.useState<PropFormState>({})
  const [searchQuery, setSearchQuery] = React.useState("")

  // Filtered catalog
  const filteredCatalog = React.useMemo(() => {
    if (!searchQuery) return catalog
    const q = searchQuery.toLowerCase()
    return catalog.filter(
      (def) =>
        getComponentLabel(def).toLowerCase().includes(q) ||
        def.name.toLowerCase().includes(q) ||
        def.description?.toLowerCase().includes(q),
    )
  }, [catalog, searchQuery])

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (open) {
      setStep("pick")
      setSelectedDef(null)
      setFormState({})
      setSearchQuery("")
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
        onInsert(jsx, def, node)
        onOpenChange(false)
        return
      }

      setStep("configure")
    },
    [onInsert, onOpenChange],
  )

  const handleInsert = React.useCallback(() => {
    if (!selectedDef) return
    const node = buildComponentNode(selectedDef, formState)
    const jsx = serializeComponentNode(node)
    onInsert(jsx, selectedDef, node)
    onOpenChange(false)
  }, [selectedDef, formState, onInsert, onOpenChange])

  const handleBack = React.useCallback(() => {
    setStep("pick")
    setSelectedDef(null)
    setFormState({})
  }, [])

  // -- Render --
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden gap-0 border-studio-border bg-studio-canvas shadow-2xl">
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
                  <div className="relative w-full sm:w-[280px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-studio-fg-muted" />
                    <Input
                      placeholder="Search..."
                      className="h-8 pl-8 pr-3 text-xs bg-studio-canvas border-studio-border-muted focus:ring-1 focus:ring-studio-accent/50"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>
              </div>

              <ScrollArea className="flex-1 px-5 py-5 min-h-0">
                <CatalogGallery catalog={filteredCatalog} onSelect={handleSelectComponent} />
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
                      <div className="scale-125 transition-transform duration-500">
                        <ComponentPreview name={selectedDef.name} className="shadow-none border-none bg-transparent" />
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
                        />
                      )}
                    </div>
                  </ScrollArea>

                  <div className="p-4 border-t border-studio-border bg-studio-canvas-inset/30 flex items-center justify-between gap-3 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs h-8">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleInsert}
                      className="h-8 px-5 rounded-md text-[11px] font-bold uppercase tracking-wider shadow-sm"
                    >
                      Insert Component
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

const galleryVariants: Variants = {
  hidden: { opacity: 1 },
  visible: {
    transition: {
      staggerChildren: 0.03,
    },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: "easeOut",
    },
  },
}

function CatalogGallery({
  catalog,
  onSelect,
}: {
  catalog: RepoComponentDef[]
  onSelect: (def: RepoComponentDef) => void
}) {
  // Re-trigger stagger on search results update
  const catalogKey = React.useMemo(() => catalog.map((c) => c.name).join(","), [catalog])

  if (catalog.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-studio-canvas-inset border border-studio-border-muted mb-4">
          <Search className="h-6 w-6 text-studio-fg-muted" />
        </div>
        <p className="text-sm font-medium text-studio-fg">No components found</p>
        <p className="text-xs text-studio-fg-muted mt-1">Try a different search term or check your config.</p>
      </div>
    )
  }

  return (
    <motion.div
      key={catalogKey}
      variants={galleryVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
    >
      {catalog.map((def) => (
        <motion.div key={def.name} variants={itemVariants}>
          <button
            type="button"
            onClick={() => onSelect(def)}
            className="w-full group relative flex flex-col gap-2 p-2 rounded-xl border border-studio-border-muted bg-studio-canvas hover:border-studio-accent/30 hover:bg-studio-canvas-inset transition-all outline-none focus-visible:ring-2 focus-visible:ring-studio-accent text-left shadow-sm hover:shadow-md"
          >
            <div className="aspect-[4/3] rounded-lg border border-studio-border-muted/30 bg-studio-canvas-inset/20 overflow-hidden relative flex items-center justify-center studio-transition group-hover:bg-studio-canvas-inset/40">
              <ComponentPreview name={def.name} className="scale-90" />
              {/* Corner accent for technical feel */}
              <div className="absolute top-1.5 left-1.5 w-1 h-1 rounded-full bg-studio-accent/10 group-hover:bg-studio-accent/30 studio-transition" />
            </div>
            <div className="px-1 pb-1 min-w-0">
              <div className="text-[13px] font-bold text-studio-fg truncate leading-tight">
                {getComponentLabel(def)}
              </div>
              {def.description ? (
                <div className="text-[11px] text-studio-fg-muted truncate mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                  {def.description}
                </div>
              ) : (
                <div className="text-[10px] font-mono text-studio-fg-muted/40 truncate mt-0.5">
                  &lt;{def.name} /&gt;
                </div>
              )}
            </div>
          </button>
        </motion.div>
      ))}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Preview component wrapper (local for type safety if needed)
// ---------------------------------------------------------------------------
