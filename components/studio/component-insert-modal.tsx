"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Box, ChevronDown, ChevronLeft, Code, FileText, Image, Layout, Search, X } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { PreviewResult } from "@/lib/preview/contracts"
import { buildGenericRenderModel } from "@/lib/preview/generic-render-model"
import {
  type AuthoringCatalog,
  type AuthoringComponent,
  componentAcceptsChildren,
} from "@/lib/studio/authoring-catalog"
import {
  ALL_CATEGORIES,
  buildComponentCatalog,
  type ComponentCategory,
  deriveCategory,
  getComponentLabel,
} from "@/lib/studio/component-catalog"
import { buildComponentNode, type ComponentNode } from "@/lib/studio/component-node"
import { serializeComponentNode } from "@/lib/studio/component-serializer"
import { resolveStudioAssetUrl } from "@/lib/studio/media-resolve"
import { cn } from "@/lib/utils"
import { ComponentPreview } from "./component-preview"
import { ComponentPropForm, type PropFormState, validateFormState } from "./component-prop-form"
import { useCompatiblePreview } from "./hooks/use-compatible-preview"
import { Preview } from "./preview"
import { useStudio } from "./studio-context"

// ---------------------------------------------------------------------------
// Declarative previews - product-specific visuals arrive through metadata and literals
// ---------------------------------------------------------------------------

function componentPreviewSessionId(source: string): string {
  let hash = 2_166_136_261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return `component-preview-${(hash >>> 0).toString(16)}`
}

function serializePreviewSource(component: AuthoringComponent, values: PropFormState): string {
  try {
    return serializeComponentNode(buildComponentNode(component, values))
  } catch {
    return ""
  }
}

function LiveComponentPreview({
  component,
  values,
  source,
  resolveImageSource,
  className,
}: {
  component: AuthoringComponent
  values: PropFormState
  source: string
  resolveImageSource: (source: string) => string
  className?: string
}) {
  const { projectId, selectedFilePath, baseCommitSha, previewEntry } = useStudio()
  const fallbackSource = source || `<${component.mdxName} />`
  const genericPreviewResult = React.useMemo<PreviewResult>(
    () => ({
      fidelity: "generic",
      sessionId: componentPreviewSessionId(fallbackSource),
      snapshotVersion: 1,
      status: "ready",
      target: { kind: "safe-fallback", renderModel: buildGenericRenderModel(fallbackSource) },
      diagnostics: [],
      downgradeReasons: ["NATIVE_UNAVAILABLE", "COMPATIBLE_UNAVAILABLE"],
      cache: { hit: false },
    }),
    [fallbackSource],
  )
  const compatible = useCompatiblePreview({
    projectId,
    filePath: selectedFilePath,
    baseCommitSha,
    previewEntry: source ? previewEntry : undefined,
    documentSource: fallbackSource,
    genericPreviewResult,
  })

  if (compatible.compatibleResolution && compatible.compatibleAuthority) {
    return (
      <div className={cn("h-full min-h-56 w-full overflow-hidden rounded-lg border border-studio-border", className)}>
        <Preview
          compact
          previewResult={compatible.previewResult}
          fallbackResult={genericPreviewResult}
          frontmatter={{}}
          projectId={projectId}
          filePath={selectedFilePath}
          compatibleResolution={compatible.compatibleResolution}
          compatibleAuthority={compatible.compatibleAuthority}
        />
      </div>
    )
  }

  return (
    <ComponentPreview
      component={component}
      values={values}
      resolveImageSource={resolveImageSource}
      className={className}
    />
  )
}

function defaultFormState(def: AuthoringComponent): PropFormState {
  const defaults: PropFormState = {}
  for (const prop of def.props) {
    if (prop.default !== undefined) defaults[prop.name] = prop.default
  }
  return defaults
}

function fieldCountLabel(count: number): string {
  return `${count} ${count === 1 ? "field" : "fields"}`
}

function slotCountLabel(count: number): string {
  return `${count} content ${count === 1 ? "slot" : "slots"}`
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
  /** Serializable authoring metadata prepared at the Studio boundary. */
  authoringCatalog: AuthoringCatalog
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
  onInsert: (jsx: string, def: AuthoringComponent, node: ComponentNode) => void
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
 * The catalog is built from native component names and serializable project
 * metadata. Executable bindings never enter modal state.
 *
 * Insert flow:
 *   form state → ComponentNode → serializer → onInsert callback
 */
export function ComponentInsertModal({
  open,
  onOpenChange,
  authoringCatalog,
  repoContext,
  onInsert,
}: ComponentInsertModalProps) {
  const studio = useStudio()
  // -- Registry & catalog (recomputed when inputs change) --
  const catalog = React.useMemo(() => buildComponentCatalog(authoringCatalog), [authoringCatalog])
  const firstCatalogName = catalog[0]?.mdxName

  // -- Modal state --
  const [step, setStep] = React.useState<ModalStep>("pick")
  const [selectedDef, setSelectedDef] = React.useState<AuthoringComponent | null>(null)
  const [formState, setFormState] = React.useState<PropFormState>({})
  const [searchQuery, setSearchQuery] = React.useState("")
  const [activeCategory, setActiveCategory] = React.useState<ComponentCategory | "All">("All")
  const [pickerSelectionName, setPickerSelectionName] = React.useState<string | null>(catalog[0]?.mdxName ?? null)
  const resolveImageSource = React.useCallback(
    (source: string) =>
      resolveStudioAssetUrl(
        source,
        repoContext?.projectId ?? studio.projectId,
        repoContext?.userId ?? studio.userId,
        repoContext?.selectedFilePath ?? studio.selectedFilePath,
        studio.projectAccessToken,
        studio.contentRoot,
      ),
    [repoContext, studio],
  )

  // -- Recently-used components --
  const [recentNames, setRecentNames] = React.useState<string[]>([])

  const recentCatalog = React.useMemo(() => {
    if (!catalog) return []
    return recentNames
      .map((name) => catalog.find((c) => c.mdxName === name))
      .filter((c): c is AuthoringComponent => c !== undefined)
  }, [recentNames, catalog])

  // Real-time validation for the configure step
  const formErrors = React.useMemo(() => {
    if (!selectedDef) return {}
    return validateFormState(selectedDef, formState)
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
          def.mdxName.toLowerCase().includes(q) ||
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
    const recentNameSet = new Set(recentCatalog.map((c) => c.mdxName))
    return filteredCatalog.filter((c) => !recentNameSet.has(c.mdxName))
  }, [filteredCatalog, recentCatalog, searchQuery, activeCategory])
  const pickerSelection = React.useMemo(
    () => filteredCatalog.find((def) => def.mdxName === pickerSelectionName) ?? filteredCatalog[0] ?? null,
    [filteredCatalog, pickerSelectionName],
  )

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (open) {
      setStep("pick")
      setSelectedDef(null)
      setFormState({})
      setSearchQuery("")
      setActiveCategory("All")
      setPickerSelectionName(firstCatalogName ?? null)
      setShowPreview(false)
      setRecentNames(getRecentComponents())
    }
  }, [open, firstCatalogName])

  // -- Handlers --
  const handleSelectComponent = React.useCallback(
    (def: AuthoringComponent) => {
      setSelectedDef(def)
      // Pre-populate with defaults
      const defaults = defaultFormState(def)
      setFormState(defaults)

      // If no configurable props and no children, insert immediately
      if (def.props.length === 0 && !componentAcceptsChildren(def)) {
        const node = buildComponentNode(def, defaults)
        const jsx = serializeComponentNode(node)
        addRecentComponent(def.mdxName)
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
    if (Object.keys(validateFormState(selectedDef, formState)).length > 0) return
    try {
      const node = buildComponentNode(selectedDef, formState)
      const jsx = serializeComponentNode(node)
      addRecentComponent(selectedDef.mdxName)
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
                    <DialogTitle className="rp-display text-xl text-studio-fg">Insert Component</DialogTitle>
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
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all duration-150 whitespace-nowrap shrink-0",
                        activeCategory === cat
                          ? "bg-studio-accent text-white border border-studio-accent"
                          : "text-studio-fg hover:text-studio-accent hover:bg-studio-canvas-inset",
                      )}
                    >
                      {CatIcon && <CatIcon className="h-3 w-3 shrink-0" />}
                      {cat}
                    </button>
                  )
                })}
              </div>

              <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                <ScrollArea className="min-h-0 flex-1 px-6 py-5">
                  {recentCatalog.length > 0 && !searchQuery && activeCategory === "All" && (
                    <div className="mb-5">
                      <h4 className="mb-3 px-1 text-[10px] font-medium uppercase tracking-widest text-studio-fg/35 select-none">
                        Recently used
                      </h4>
                      <CatalogGallery
                        catalog={recentCatalog}
                        selectedName={pickerSelection?.mdxName ?? null}
                        onPreviewSelect={(def) => setPickerSelectionName(def.mdxName)}
                      />
                    </div>
                  )}
                  {/* Suppress main grid when all components are already shown in Recently used */}
                  {(mainCatalog.length > 0 ||
                    recentCatalog.length === 0 ||
                    searchQuery ||
                    activeCategory !== "All") && (
                    <>
                      {recentCatalog.length > 0 &&
                        !searchQuery &&
                        activeCategory === "All" &&
                        mainCatalog.length > 0 && (
                          <h4 className="mb-3 px-1 text-[10px] font-medium uppercase tracking-widest text-studio-fg/35 select-none">
                            All components
                          </h4>
                        )}
                      <CatalogGallery
                        catalog={mainCatalog}
                        selectedName={pickerSelection?.mdxName ?? null}
                        onPreviewSelect={(def) => setPickerSelectionName(def.mdxName)}
                      />
                    </>
                  )}
                </ScrollArea>

                <aside
                  aria-label="Selected component details"
                  className="w-full shrink-0 border-t border-studio-border bg-studio-canvas-inset/30 p-5 md:w-[42%] md:border-t-0 md:border-l"
                >
                  {pickerSelection ? (
                    <div className="flex h-full flex-col gap-4">
                      <div className="min-h-0 flex-1">
                        <LiveComponentPreview
                          component={pickerSelection}
                          values={defaultFormState(pickerSelection)}
                          source={serializePreviewSource(pickerSelection, defaultFormState(pickerSelection))}
                          resolveImageSource={resolveImageSource}
                          className="min-h-56 p-0"
                        />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-studio-fg">{getComponentLabel(pickerSelection)}</h3>
                        {pickerSelection.description ? (
                          <p className="text-xs leading-relaxed text-studio-fg-muted">{pickerSelection.description}</p>
                        ) : null}
                        <p className="text-xs text-studio-fg-muted">
                          {fieldCountLabel(pickerSelection.props.length)}
                          {pickerSelection.slots.length > 0 ? ` · ${slotCountLabel(pickerSelection.slots.length)}` : ""}
                        </p>
                      </div>
                      <Button type="button" size="sm" onClick={() => handleSelectComponent(pickerSelection)}>
                        {pickerSelection.props.length === 0 && !componentAcceptsChildren(pickerSelection)
                          ? "Insert component"
                          : "Configure selected component"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-48 items-center justify-center text-center text-sm text-studio-fg-muted">
                      Select a component to see its details.
                    </div>
                  )}
                </aside>
              </div>
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
                          {fieldCountLabel(selectedDef.props.length)}
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
                        key={selectedDef.mdxName}
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="w-full flex items-center justify-center p-4"
                      >
                        <LiveComponentPreview
                          component={selectedDef}
                          values={formState}
                          source={jsxPreview}
                          resolveImageSource={resolveImageSource}
                          className="border-none bg-transparent shadow-none"
                        />
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
                          "h-9 px-6 text-xs font-medium tracking-wide",
                          hasErrors ? "opacity-50 cursor-not-allowed" : "",
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

function ComponentCard({
  def,
  selected,
  buttonRef,
  onPreviewSelect,
  onKeyDown,
}: {
  def: AuthoringComponent
  selected: boolean
  buttonRef: (node: HTMLButtonElement | null) => void
  onPreviewSelect: (def: AuthoringComponent) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
}) {
  const category = deriveCategory(def)
  const label = getComponentLabel(def)
  const style = categoryStyles[category]
  const Icon = style.icon

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-pressed={selected}
      onClick={() => onPreviewSelect(def)}
      onFocus={() => onPreviewSelect(def)}
      onKeyDown={onKeyDown}
      className={cn(
        "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left outline-none cursor-pointer",
        selected ? "bg-studio-accent-muted" : "hover:bg-studio-canvas-inset",
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
          {fieldCountLabel(def.props.length)}
        </span>
      )}
    </button>
  )
}

function CatalogGallery({
  catalog,
  selectedName,
  onPreviewSelect,
}: {
  catalog: AuthoringComponent[]
  selectedName: string | null
  onPreviewSelect: (def: AuthoringComponent) => void
}) {
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([])

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
    <fieldset className="min-w-0 space-y-0.5 border-0 p-0">
      <legend className="sr-only">Available components</legend>
      {catalog.map((def, index) => (
        <ComponentCard
          key={def.mdxName}
          def={def}
          selected={selectedName === def.mdxName}
          buttonRef={(node) => {
            buttonRefs.current[index] = node
          }}
          onPreviewSelect={onPreviewSelect}
          onKeyDown={(event) => {
            let nextIndex: number | null = null
            if (event.key === "ArrowDown") nextIndex = (index + 1) % catalog.length
            else if (event.key === "ArrowUp") nextIndex = (index - 1 + catalog.length) % catalog.length
            else if (event.key === "Home") nextIndex = 0
            else if (event.key === "End") nextIndex = catalog.length - 1
            if (nextIndex === null) return
            event.preventDefault()
            const next = catalog[nextIndex]
            if (next) onPreviewSelect(next)
            buttonRefs.current[nextIndex]?.focus()
          }}
        />
      ))}
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// Preview component wrapper (local for type safety if needed)
// ---------------------------------------------------------------------------
