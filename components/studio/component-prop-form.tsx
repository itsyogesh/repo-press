"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { AuthoringComponent, AuthoringProp } from "@/lib/studio/authoring-catalog"
import { componentAcceptsChildren } from "@/lib/studio/authoring-catalog"
import { cn } from "@/lib/utils"
import { ImageFieldControl } from "./image-field-control"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PropFormState = Record<string, unknown>

/** Returns names of props marked as required. */
export function getRequiredProps(props: AuthoringProp[]): string[] {
  return props.filter((p) => p.required).map((p) => p.name)
}

/** Validates form state against required props. Returns map of field name → error message. */
export function validateFormState(props: AuthoringProp[], state: PropFormState): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const prop of props) {
    if (!prop.required) continue
    const val = state[prop.name]
    if (prop.type === "boolean") continue
    if (val === undefined || val === null || (typeof val === "string" && val.trim() === "")) {
      errors[prop.name] = "Required"
    }
  }
  return errors
}

interface ComponentPropFormProps {
  def: AuthoringComponent
  formState: PropFormState
  onFormChange: (next: PropFormState) => void
  /** Optional repo context for image uploads. */
  repoContext?: {
    projectId: string
    userId?: string
    owner: string
    repo: string
    branch: string
    selectedFilePath?: string
  }
  /** Map of prop name → error message for validation display. */
  errors?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Dynamic typed prop form rendered from an `AuthoringComponent`.
 *
 * Renders one control per prop definition:
 * - `string`     → text input
 * - `number`     → number input
 * - `boolean`    → switch toggle
 * - `expression` → text input (monospace, curly-brace hint)
 * - `image`      → rich image picker with preview (ImageFieldControl)
 *
 * If the component declares a children slot, an additional textarea is rendered
 * for children content.
 */
export function ComponentPropForm({ def, formState, onFormChange, repoContext, errors = {} }: ComponentPropFormProps) {
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
          error={errors[propDef.name]}
        />
      ))}

      {componentAcceptsChildren(def) && (
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
  error,
}: {
  propDef: AuthoringProp
  value: unknown
  onChange: (v: unknown) => void
  repoContext?: {
    projectId: string
    userId?: string
    owner: string
    repo: string
    branch: string
    selectedFilePath?: string
  }
  error?: string
}) {
  const label = propDef.label ?? propDef.name
  const id = `prop-${propDef.name}`
  const placeholder = propDef.placeholder ?? (propDef.default !== undefined ? String(propDef.default) : undefined)
  const errorClass = error ? "border-destructive focus-visible:ring-destructive/50" : ""

  const labelContent = (
    <>
      {label}
      {propDef.required && <span className="ml-0.5 text-destructive">*</span>}
    </>
  )

  const descriptionEl = propDef.description ? (
    <p className="text-xs text-muted-foreground">{propDef.description}</p>
  ) : null

  const errorEl = error ? <p className="text-xs text-destructive">{error}</p> : null

  // Enum/Select: render <Select> when options array is present
  if (propDef.options && propDef.options.length > 0) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{labelContent}</Label>
        <Select value={typeof value === "string" ? value : ""} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id={id} className={cn("h-9", errorClass)}>
            <SelectValue placeholder={placeholder ?? "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {propDef.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {descriptionEl}
        {errorEl}
      </div>
    )
  }

  switch (propDef.type) {
    case "boolean":
      return (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={id}>{labelContent}</Label>
          <Switch
            id={id}
            checked={value === true || value === "true"}
            onCheckedChange={(checked) => onChange(checked)}
          />
          {descriptionEl}
          {errorEl}
        </div>
      )

    case "number":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{labelContent}</Label>
          <Input
            id={id}
            type="number"
            placeholder={placeholder}
            value={value !== undefined && value !== null ? String(value) : ""}
            onChange={(e) => onChange(e.target.value)}
            className={errorClass}
          />
          {descriptionEl}
          {errorEl}
        </div>
      )

    case "expression":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>
            {labelContent}
            <span className="ml-1.5 text-xs text-muted-foreground font-normal">(expression)</span>
          </Label>
          <Input
            id={id}
            placeholder={placeholder ?? "{value}"}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={`font-mono text-sm ${errorClass}`}
          />
          {descriptionEl || (
            <p className="text-xs text-muted-foreground">
              JSX expression, e.g. {"{"}variable{"}"} or {"{"}
              [&quot;a&quot;, &quot;b&quot;]{"}"}
            </p>
          )}
          {errorEl}
        </div>
      )

    case "image": {
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>
            {labelContent}
            <span className="ml-1.5 text-xs text-muted-foreground font-normal">(image)</span>
          </Label>
          <ImageFieldControl
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
            placeholder={placeholder ?? "Select or upload image..."}
            repoContext={repoContext}
            selectedFilePath={repoContext?.selectedFilePath}
          />
          {descriptionEl}
          {errorEl}
        </div>
      )
    }

    // "string" and fallback
    default: {
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{labelContent}</Label>
          <Input
            id={id}
            placeholder={placeholder}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={errorClass}
          />
          {descriptionEl}
          {errorEl}
        </div>
      )
    }
  }
}
