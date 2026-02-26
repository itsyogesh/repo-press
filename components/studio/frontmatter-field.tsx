"use client"

import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { normalizeDate } from "@/lib/framework-adapters"
import type { MergedFieldDef } from "@/lib/framework-adapters"
import { TagInput } from "./tag-input"
import { ImageField } from "./image-field"

interface FrontmatterFieldProps {
  field: MergedFieldDef
  value: any
  onChange: (value: any) => void
}

export function FrontmatterField({ field, value, onChange }: FrontmatterFieldProps) {
  const id = field.actualFieldName
  const hasSchemaHint =
    field.actualFieldName !== field.name && field.description !== field.actualFieldName

  const labelEl = (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={id} className="font-semibold text-sm text-studio-fg">
        {field.actualFieldName}
      </Label>
      {field.required && (
        <span className="text-studio-attention text-sm" title="Required">●</span>
      )}
    </div>
  )

  const helperEl = (hasSchemaHint || field.description) ? (
    <p className="text-[11px] text-studio-fg-muted mt-0.5 leading-tight">
      {field.description || `↳ ${field.name}`}
    </p>
  ) : null

  switch (field.type) {
    case "boolean":
      return (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            {labelEl}
            {helperEl}
          </div>
          <Switch
            id={id}
            checked={!!value}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      )

    case "date":
      return (
        <div className="grid gap-1">
          {labelEl}
          {helperEl}
          <Input
            id={id}
            type="date"
            value={normalizeDate(value)}
            onChange={(e) => onChange(e.target.value)}
            className="border-studio-border"
          />
        </div>
      )

    case "number":
      return (
        <div className="grid gap-1">
          {labelEl}
          {helperEl}
          <Input
            id={id}
            type="number"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            className="border-studio-border"
          />
        </div>
      )

    case "string[]":
      return (
        <div className="grid gap-1">
          {labelEl}
          {helperEl}
          <TagInput
            value={Array.isArray(value) ? value : []}
            onChange={onChange}
            placeholder="Add tag..."
          />
        </div>
      )

    case "image":
      return (
        <div className="grid gap-1">
          {labelEl}
          {helperEl}
          <ImageField value={value || ""} onChange={onChange} />
        </div>
      )

    case "object":
      return (
        <div className="grid gap-1">
          {labelEl}
          {helperEl}
          <Textarea
            id={id}
            value={typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "")}
            disabled
            className="font-mono text-xs h-24 bg-studio-canvas-inset border-studio-border"
          />
        </div>
      )

    default: {
      const isLongText =
        field.actualFieldName === "description" ||
        field.actualFieldName === "summary" ||
        field.actualFieldName === "excerpt" ||
        field.actualFieldName === "bio" ||
        field.name === "description" ||
        field.name === "summary" ||
        field.name === "excerpt"

      if (isLongText) {
        const charCount = (value || "").length
        const isOverLimit = charCount > 160
        return (
          <div className="grid gap-1">
            {labelEl}
            {helperEl}
            <Textarea
              id={id}
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.description}
              className="h-20 border-studio-border resize-none"
            />
            {(field.actualFieldName === "description" || field.name === "description") && (
              <p className={`text-[10px] ${isOverLimit ? "text-studio-danger" : "text-studio-fg-muted"} text-right`}>
                {charCount}/160 chars
              </p>
            )}
          </div>
        )
      }

      return (
        <div className="grid gap-1">
          {labelEl}
          {helperEl}
          <Input
            id={id}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.description}
            className="border-studio-border"
          />
        </div>
      )
    }
  }
}
