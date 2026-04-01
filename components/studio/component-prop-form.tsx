"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { RepoComponentDef, RepoComponentPropDef } from "@/lib/studio/component-registry"
import { ImageFieldControl } from "./image-field-control"
import { VideoPreview } from "./video-preview"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PropFormState = Record<string, unknown>

export function shouldShowVideoPreview(componentName: string | undefined, propName: string): boolean {
  return /docs\s*video/i.test(String(componentName || "")) && propName === "src"
}

interface ComponentPropFormProps {
  def: RepoComponentDef
  formState: PropFormState
  onFormChange: (next: PropFormState) => void
  /** Optional repo context for image uploads. */
  repoContext?: {
    projectId: string
    userId?: string
    owner: string
    repo: string
    branch: string
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Dynamic typed prop form rendered from a `RepoComponentDef`.
 *
 * Renders one control per prop definition:
 * - `string`     → text input
 * - `number`     → number input
 * - `boolean`    → switch toggle
 * - `expression` → text input (monospace, curly-brace hint)
 * - `image`      → rich image picker with preview (ImageFieldControl)
 *
 * If `def.hasChildren` is true, an additional textarea is rendered
 * for children content.
 */
export function ComponentPropForm({ def, formState, onFormChange, repoContext }: ComponentPropFormProps) {
  const setProp = React.useCallback(
    (name: string, value: unknown) => {
      onFormChange({ ...formState, [name]: value })
    },
    [formState, onFormChange],
  )

  return (
    <div className="space-y-4">
      {def.props.map((propDef) => (
        <PropField
          key={propDef.name}
          propDef={propDef}
          value={formState[propDef.name]}
          onChange={(v) => setProp(propDef.name, v)}
          repoContext={repoContext}
          componentName={def.displayName ?? def.name}
        />
      ))}

      {def.hasChildren && (
        <div className="space-y-1.5">
          <Label htmlFor="__children">Children</Label>
          <Textarea
            id="__children"
            placeholder="Content inside the component..."
            value={typeof formState.children === "string" ? formState.children : ""}
            onChange={(e) => setProp("children", e.target.value)}
            className="min-h-[80px] font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">MDX content placed between open/close tags.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual prop field
// ---------------------------------------------------------------------------

function PropField({
  propDef,
  value,
  onChange,
  repoContext,
  componentName,
}: {
  propDef: RepoComponentPropDef
  value: unknown
  onChange: (v: unknown) => void
  repoContext?: {
    projectId: string
    userId?: string
    owner: string
    repo: string
    branch: string
  }
  componentName?: string
}) {
  const label = propDef.label ?? propDef.name
  const id = `prop-${propDef.name}`

  switch (propDef.type) {
    case "boolean":
      return (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={id}>{label}</Label>
          <Switch
            id={id}
            checked={value === true || value === "true"}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      )

    case "number":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input
            id={id}
            type="number"
            placeholder={propDef.default !== undefined ? String(propDef.default) : undefined}
            value={value !== undefined && value !== null ? String(value) : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )

    case "expression":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>
            {label}
            <span className="ml-1.5 text-xs text-muted-foreground font-normal">(expression)</span>
          </Label>
          <Input
            id={id}
            placeholder={propDef.default !== undefined ? String(propDef.default) : "{value}"}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            JSX expression, e.g. {"{"}variable{"}"} or {"{"}
            [&quot;a&quot;, &quot;b&quot;]{"}"}
          </p>
        </div>
      )

    case "image": {
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>
            {label}
            <span className="ml-1.5 text-xs text-muted-foreground font-normal">(image)</span>
          </Label>
          <ImageFieldControl
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
            placeholder="Select or upload image..."
            repoContext={repoContext}
          />
        </div>
      )
    }

    // "string" and fallback
    default: {
      const isVideoComponent = shouldShowVideoPreview(componentName, propDef.name)

      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input
            id={id}
            placeholder={propDef.default !== undefined ? String(propDef.default) : undefined}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {isVideoComponent && typeof value === "string" && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-2">Preview:</p>
              <VideoPreview url={value} className="max-w-full" />
            </div>
          )}
        </div>
      )
    }
  }
}
