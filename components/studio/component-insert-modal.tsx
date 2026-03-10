"use client"

import { Box, ChevronLeft, ImageIcon, Settings2, Type } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { buildComponentCatalog, getComponentLabel } from "@/lib/studio/component-catalog"
import { buildComponentNode, type ComponentNode } from "@/lib/studio/component-node"
import type { RepoComponentDef } from "@/lib/studio/component-registry"
import { buildComponentRegistry } from "@/lib/studio/component-registry"
import { serializeComponentNode } from "@/lib/studio/component-serializer"
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

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (open) {
      setStep("pick")
      setSelectedDef(null)
      setFormState({})
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
      <DialogContent className="sm:max-w-md">
        {step === "pick" ? (
          <>
            <DialogHeader>
              <DialogTitle>Insert Component</DialogTitle>
              <DialogDescription>Choose a component to insert into your document.</DialogDescription>
            </DialogHeader>
            <CatalogPicker catalog={catalog} onSelect={handleSelectComponent} />
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-md p-1 hover:bg-accent transition-colors"
                  aria-label="Back to component list"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <DialogTitle>{selectedDef ? getComponentLabel(selectedDef) : "Configure"}</DialogTitle>
              </div>
              {selectedDef?.description && <DialogDescription>{selectedDef.description}</DialogDescription>}
            </DialogHeader>
            {selectedDef && (
              <ScrollArea className="max-h-[50vh] pr-3">
                <ComponentPropForm
                  def={selectedDef}
                  formState={formState}
                  onFormChange={setFormState}
                  repoContext={repoContext}
                />
              </ScrollArea>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleInsert}>Insert</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Catalog picker sub-component
// ---------------------------------------------------------------------------

function CatalogPicker({
  catalog,
  onSelect,
}: {
  catalog: RepoComponentDef[]
  onSelect: (def: RepoComponentDef) => void
}) {
  if (catalog.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No components available. Add components to your{" "}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">repopress.config.json</code> or use a framework adapter.
      </div>
    )
  }

  return (
    <ScrollArea className="max-h-[50vh]">
      <div className="space-y-1 pr-3">
        {catalog.map((def) => (
          <button
            key={def.name}
            type="button"
            onClick={() => onSelect(def)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent transition-colors group"
          >
            <ComponentIcon def={def} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{getComponentLabel(def)}</div>
              {def.description && <div className="text-xs text-muted-foreground truncate">{def.description}</div>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {def.source === "config" && (
                <span className="text-[10px] bg-studio-accent-muted text-studio-accent px-1.5 py-0.5 rounded font-medium">
                  Config
                </span>
              )}
              {def.source === "adapter" && (
                <span className="text-[10px] bg-studio-success-muted text-studio-success px-1.5 py-0.5 rounded font-medium">
                  Adapter
                </span>
              )}
              {def.source === "merged" && (
                <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-medium">
                  Merged
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}

// ---------------------------------------------------------------------------
// Icon helper
// ---------------------------------------------------------------------------

function ComponentIcon({ def }: { def: RepoComponentDef }) {
  if (def.capabilities?.media) {
    return <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
  }
  if (def.capabilities?.inline) {
    return <Type className="h-4 w-4 text-muted-foreground shrink-0" />
  }
  if (def.capabilities?.configurable) {
    return <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
  }
  return <Box className="h-4 w-4 text-muted-foreground shrink-0" />
}
