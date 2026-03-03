"use client"

import { ImageIcon, Loader2, Upload } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { RepoComponentDef, RepoComponentPropDef } from "@/lib/studio/component-registry"
import { uploadMedia } from "@/lib/studio/media-upload"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PropFormState = Record<string, unknown>

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
 * - `image`      → text input (URL / path)
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
}) {
  const label = propDef.label ?? propDef.name
  const id = `prop-${propDef.name}`
  const [uploading, setUploading] = React.useState(false)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)

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
      const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !repoContext) return
        setUploading(true)
        try {
          const result = await uploadMedia({
            file,
            projectId: repoContext.projectId,
            userId: repoContext.userId,
            owner: repoContext.owner,
            repo: repoContext.repo,
            branch: repoContext.branch,
            storagePreference: "auto",
          })
          onChange(result.repoPath)
          setPreviewUrl(result.previewUrl)
          toast.success(`Uploaded via ${result.storage}: ${result.repoPath}`)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Upload failed")
        } finally {
          setUploading(false)
        }
      }

      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>
            {label}
            <span className="ml-1.5 text-xs text-muted-foreground font-normal">(image)</span>
          </Label>
          <div className="flex gap-2">
            <Input
              id={id}
              placeholder="/images/example.png or https://..."
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1"
            />
            {repoContext && (
              <Button type="button" variant="outline" size="icon" className="shrink-0" disabled={uploading} asChild>
                <label htmlFor={`${id}-file`} className="cursor-pointer">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <input
                    id={`${id}-file`}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleFileSelect}
                    disabled={uploading}
                  />
                </label>
              </Button>
            )}
          </div>
          {typeof value === "string" && value.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageIcon className="h-3 w-3" />
              <span className="truncate">{value}</span>
            </div>
          )}
          {previewUrl && (
            <p className="text-xs text-muted-foreground break-all">
              Preview: <span className="font-mono">{previewUrl}</span>
            </p>
          )}
        </div>
      )
    }

    // "string" and fallback
    default:
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input
            id={id}
            placeholder={propDef.default !== undefined ? String(propDef.default) : undefined}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )
  }
}
