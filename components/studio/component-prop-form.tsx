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

/** Validates declarative props and slots without evaluating expert expressions. */
export function validateFormState(def: AuthoringComponent, state: PropFormState): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const prop of def.props) {
    const val = state[prop.name]
    const missing = val === undefined || val === null || (typeof val === "string" && val.trim() === "")
    if (prop.required && missing) {
      errors[prop.name] = "Required"
      continue
    }
    if (missing) continue
    if (prop.options && (typeof val !== "string" || !prop.options.includes(val))) {
      errors[prop.name] = "Choose an allowed value"
      continue
    }
    if (prop.type === "number" && !Number.isFinite(Number(val))) {
      errors[prop.name] = "Enter a finite number"
      continue
    }
    if (prop.type === "boolean" && typeof val !== "boolean") {
      errors[prop.name] = "Choose true or false"
      continue
    }
    if (["string", "expression", "image"].includes(prop.type) && typeof val !== "string") {
      errors[prop.name] = "Enter text"
    }
  }
  for (const slot of def.slots) {
    if (!slot.required) continue
    const value = state[slot.name]
    if (typeof value !== "string" || value.trim() === "") errors[slot.name] = "Required"
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
          <Label htmlFor="__children">
            Children
            {def.slots.some((slot) => slot.name === "children" && slot.required) ? (
              <span aria-hidden="true" className="ml-0.5 text-destructive">
                *
              </span>
            ) : null}
          </Label>
          <Textarea
            id="__children"
            placeholder="Content inside the component..."
            value={typeof formState.children === "string" ? formState.children : ""}
            onChange={(e) => setProp("children", e.target.value)}
            className="min-h-[80px] font-mono text-sm"
            required={def.slots.some((slot) => slot.name === "children" && slot.required)}
            aria-invalid={errors.children ? true : undefined}
            aria-describedby={errors.children ? "__children-error" : "__children-description"}
          />
          <p id="__children-description" className="text-xs text-muted-foreground">
            MDX content placed between open/close tags.
          </p>
          {errors.children ? (
            <p id="__children-error" className="text-xs text-destructive">
              {errors.children}
            </p>
          ) : null}
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
  const labelId = `${id}-label`
  const descriptionId = `${id}-description`
  const errorId = `${id}-error`
  const placeholder = propDef.placeholder ?? (propDef.default !== undefined ? String(propDef.default) : undefined)
  const errorClass = error ? "border-destructive focus-visible:ring-destructive/50" : ""

  const labelContent = (
    <>
      {label}
      {propDef.required && (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      )}
    </>
  )

  const descriptionEl = propDef.description ? (
    <p id={descriptionId} className="text-xs text-muted-foreground">
      {propDef.description}
    </p>
  ) : null

  const errorEl = error ? (
    <p id={errorId} className="text-xs text-destructive">
      {error}
    </p>
  ) : null
  const describedBy = [propDef.description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ")

  // Enum/Select: render <Select> when options array is present
  if (propDef.options && propDef.options.length > 0) {
    return (
      <div className="space-y-1.5">
        <Label id={labelId} htmlFor={id}>
          {labelContent}
        </Label>
        <Select value={typeof value === "string" ? value : ""} onValueChange={(v) => onChange(v)}>
          <SelectTrigger
            id={id}
            aria-labelledby={labelId}
            aria-describedby={describedBy || undefined}
            aria-invalid={error ? true : undefined}
            className={cn("h-9", errorClass)}
          >
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
      if (propDef.required) {
        return (
          <div className="space-y-1.5">
            <Label id={labelId} htmlFor={id}>
              {labelContent}
            </Label>
            <Select
              value={value === true ? "true" : value === false ? "false" : ""}
              onValueChange={(nextValue) => onChange(nextValue === "true")}
            >
              <SelectTrigger
                id={id}
                aria-labelledby={labelId}
                aria-describedby={describedBy || undefined}
                aria-invalid={error ? true : undefined}
                className={cn("h-9", errorClass)}
              >
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">True</SelectItem>
                <SelectItem value="false">False</SelectItem>
              </SelectContent>
            </Select>
            {descriptionEl}
            {errorEl}
          </div>
        )
      }
      return (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={id}>{labelContent}</Label>
          <Switch
            id={id}
            checked={value === true || value === "true"}
            onCheckedChange={(checked) => onChange(checked)}
            aria-describedby={describedBy || undefined}
            aria-invalid={error ? true : undefined}
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
            aria-describedby={describedBy || undefined}
            aria-invalid={error ? true : undefined}
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
            aria-describedby={describedBy || undefined}
            aria-invalid={error ? true : undefined}
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
            aria-describedby={describedBy || undefined}
            aria-invalid={error ? true : undefined}
          />
          {descriptionEl}
          {errorEl}
        </div>
      )
    }
  }
}
