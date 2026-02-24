"use client"

import { ChevronDown, ChevronRight, Save, Upload } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { UNIVERSAL_FIELDS, buildMergedFieldList, normalizeDate } from "@/lib/framework-adapters"
import type { FieldVariantMap, FrontmatterFieldDef, MergedFieldDef } from "@/lib/framework-adapters"

interface EditorProps {
  content: string
  frontmatter: Record<string, any>
  frontmatterSchema?: FrontmatterFieldDef[]
  fieldVariants?: FieldVariantMap
  onChangeContent: (value: string) => void
  onChangeFrontmatter: (key: string, value: any) => void
  onSaveDraft: () => void
  onPublish: () => void
  isSaving: boolean
  isPublishing: boolean
  canPublish: boolean
  statusBadge: React.ReactNode
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
}

export function Editor({
  content,
  frontmatter,
  frontmatterSchema,
  fieldVariants,
  onChangeContent,
  onChangeFrontmatter,
  onSaveDraft,
  onPublish,
  isSaving,
  isPublishing,
  canPublish,
  statusBadge,
  scrollContainerRef,
  onScroll,
}: EditorProps) {
  const [isFrontmatterOpen, setIsFrontmatterOpen] = React.useState(true)
  const [showEmptySchema, setShowEmptySchema] = React.useState(false)

  const schema = frontmatterSchema && frontmatterSchema.length > 0 ? frontmatterSchema : UNIVERSAL_FIELDS
  const mergedFields = React.useMemo(
    () => buildMergedFieldList(frontmatter, schema, fieldVariants),
    [frontmatter, schema, fieldVariants],
  )

  const fieldsInFile = mergedFields.filter((f) => f.isInFile)
  const emptySchemaFields = mergedFields.filter((f) => !f.isInFile)

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Editor</span>
          {statusBadge}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onSaveDraft} disabled={isSaving || isPublishing}>
            <Save className="h-4 w-4 mr-1" />
            {isSaving ? "Saving..." : "Save Draft"}
          </Button>
          <Button
            size="sm"
            onClick={onPublish}
            disabled={isSaving || isPublishing || !canPublish}
            title={canPublish ? "Publish to GitHub" : "Only draft or approved documents can be published"}
          >
            <Upload className="h-4 w-4 mr-1" />
            {isPublishing ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </div>

      <div ref={scrollContainerRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          <Collapsible
            open={isFrontmatterOpen}
            onOpenChange={setIsFrontmatterOpen}
            className="border rounded-md bg-card"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <h3 className="text-sm font-semibold">Frontmatter</h3>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-9 p-0">
                  {isFrontmatterOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="sr-only">Toggle Frontmatter</span>
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="p-4 space-y-4">
              {fieldsInFile.map((field) => (
                <MergedFrontmatterField
                  key={field.actualFieldName}
                  field={field}
                  value={frontmatter[field.actualFieldName]}
                  onChange={(value) => onChangeFrontmatter(field.actualFieldName, value)}
                />
              ))}
              {emptySchemaFields.length > 0 && (
                <div className="border-t pt-3 mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground p-0 h-auto hover:text-foreground"
                    onClick={() => setShowEmptySchema(!showEmptySchema)}
                  >
                    {showEmptySchema ? (
                      <ChevronDown className="h-3 w-3 mr-1" />
                    ) : (
                      <ChevronRight className="h-3 w-3 mr-1" />
                    )}
                    Show {emptySchemaFields.length} available schema field{emptySchemaFields.length !== 1 ? "s" : ""}
                    <span className="ml-1 text-muted-foreground/70">
                      ({emptySchemaFields.map((f) => f.name).join(", ")} — not in this file)
                    </span>
                  </Button>
                  {showEmptySchema && (
                    <div className="mt-3 space-y-4">
                      {emptySchemaFields.map((field) => (
                        <MergedFrontmatterField
                          key={field.actualFieldName}
                          field={field}
                          value={frontmatter[field.actualFieldName]}
                          onChange={(value) => onChangeFrontmatter(field.actualFieldName, value)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <Label>Content (MDX)</Label>
            <Textarea
              value={content}
              onChange={(e) => onChangeContent(e.target.value)}
              className="min-h-[500px] font-mono text-sm"
              placeholder="Write your content here..."
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function MergedFrontmatterField({
  field,
  value,
  onChange,
}: {
  field: MergedFieldDef
  value: any
  onChange: (value: any) => void
}) {
  const id = field.actualFieldName
  // Show schema description as helper text when the actual field name differs from schema name
  const hasSchemaHint = field.actualFieldName !== field.name && field.description !== field.actualFieldName

  const labelEl = (
    <div>
      <Label htmlFor={id} className="font-semibold">
        {field.actualFieldName}
      </Label>
      {hasSchemaHint && <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>}
    </div>
  )

  switch (field.type) {
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Checkbox id={id} checked={!!value} onCheckedChange={(checked) => onChange(checked)} />
          <div>
            <Label htmlFor={id} className="text-sm font-semibold">
              {field.actualFieldName}
            </Label>
            {hasSchemaHint && <p className="text-xs text-muted-foreground">{field.description}</p>}
          </div>
        </div>
      )

    case "date":
      return (
        <div className="grid gap-1">
          {labelEl}
          <Input
            id={id}
            type="date"
            value={normalizeDate(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )

    case "number":
      return (
        <div className="grid gap-1">
          {labelEl}
          <Input
            id={id}
            type="number"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
      )

    case "string[]":
      return (
        <div className="grid gap-1">
          {labelEl}
          <Input
            id={id}
            value={Array.isArray(value) ? value.join(", ") : value || ""}
            onChange={(e) => {
              const raw = e.target.value
              onChange(
                raw
                  ? raw
                      .split(",")
                      .map((s: string) => s.trim())
                      .filter(Boolean)
                  : [],
              )
            }}
            placeholder={`e.g. item1, item2, item3`}
          />
        </div>
      )

    case "image":
      return (
        <div className="grid gap-1">
          {labelEl}
          <Input
            id={id}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="/images/cover.jpg"
          />
        </div>
      )

    case "object":
      return (
        <div className="grid gap-1">
          {labelEl}
          <Textarea
            id={id}
            value={typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "")}
            disabled
            className="font-mono text-xs h-24 bg-muted"
          />
        </div>
      )

    default: {
      // Use textarea for description-like fields
      const isLongText =
        field.actualFieldName === "description" ||
        field.actualFieldName === "summary" ||
        field.actualFieldName === "excerpt" ||
        field.actualFieldName === "bio" ||
        field.name === "description" ||
        field.name === "summary" ||
        field.name === "excerpt"

      if (isLongText) {
        return (
          <div className="grid gap-1">
            {labelEl}
            <Textarea
              id={id}
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.description}
              className="h-20"
            />
          </div>
        )
      }
      return (
        <div className="grid gap-1">
          {labelEl}
          <Input
            id={id}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.description}
          />
        </div>
      )
    }
  }
}
