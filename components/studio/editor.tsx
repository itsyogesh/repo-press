"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ChevronRight, Save, Upload } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

type FrontmatterFieldDef = {
  name: string
  type: "string" | "string[]" | "number" | "boolean" | "date" | "image"
  required: boolean
  description: string
  defaultValue?: any
}

const DEFAULT_SCHEMA: FrontmatterFieldDef[] = [
  { name: "title", type: "string", required: true, description: "Page or post title" },
  { name: "description", type: "string", required: false, description: "SEO meta description" },
  { name: "date", type: "date", required: false, description: "Publication date" },
  { name: "draft", type: "boolean", required: false, description: "Whether this is a draft" },
  { name: "tags", type: "string[]", required: false, description: "Tags (comma separated)" },
  { name: "coverImage", type: "image", required: false, description: "Cover image URL" },
]

interface EditorProps {
  content: string
  frontmatter: Record<string, any>
  frontmatterSchema?: FrontmatterFieldDef[]
  onChangeContent: (value: string) => void
  onChangeFrontmatter: (key: string, value: any) => void
  onSaveDraft: () => void
  onPublish: () => void
  isSaving: boolean
  isPublishing: boolean
  canPublish: boolean
  statusBadge: React.ReactNode
}

export function Editor({
  content,
  frontmatter,
  frontmatterSchema,
  onChangeContent,
  onChangeFrontmatter,
  onSaveDraft,
  onPublish,
  isSaving,
  isPublishing,
  canPublish,
  statusBadge,
}: EditorProps) {
  const [isFrontmatterOpen, setIsFrontmatterOpen] = React.useState(true)

  const schema = frontmatterSchema && frontmatterSchema.length > 0 ? frontmatterSchema : DEFAULT_SCHEMA

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
          <Button size="sm" onClick={onPublish} disabled={isSaving || isPublishing || !canPublish} title={canPublish ? "Publish to GitHub" : "Only draft or approved documents can be published"}>
            <Upload className="h-4 w-4 mr-1" />
            {isPublishing ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
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
              {schema.map((field) => (
                <FrontmatterField
                  key={field.name}
                  field={field}
                  value={frontmatter[field.name]}
                  onChange={(value) => onChangeFrontmatter(field.name, value)}
                />
              ))}
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
      </ScrollArea>
    </div>
  )
}

function FrontmatterField({
  field,
  value,
  onChange,
}: {
  field: FrontmatterFieldDef
  value: any
  onChange: (value: any) => void
}) {
  switch (field.type) {
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={field.name}
            checked={!!value}
            onCheckedChange={(checked) => onChange(checked)}
          />
          <Label htmlFor={field.name} className="text-sm font-normal">
            {field.description}
          </Label>
        </div>
      )

    case "date":
      return (
        <div className="grid gap-2">
          <Label htmlFor={field.name}>{field.description}</Label>
          <Input
            id={field.name}
            type="date"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )

    case "number":
      return (
        <div className="grid gap-2">
          <Label htmlFor={field.name}>{field.description}</Label>
          <Input
            id={field.name}
            type="number"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
      )

    case "string[]":
      return (
        <div className="grid gap-2">
          <Label htmlFor={field.name}>{field.description}</Label>
          <Input
            id={field.name}
            value={Array.isArray(value) ? value.join(", ") : value || ""}
            onChange={(e) => {
              const raw = e.target.value
              onChange(raw ? raw.split(",").map((s: string) => s.trim()).filter(Boolean) : [])
            }}
            placeholder={`e.g. item1, item2, item3`}
          />
        </div>
      )

    case "image":
      return (
        <div className="grid gap-2">
          <Label htmlFor={field.name}>{field.description}</Label>
          <Input
            id={field.name}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="/images/cover.jpg"
          />
        </div>
      )

    case "string":
    default:
      // Use textarea for description-like fields
      if (field.name === "description" || field.name === "summary" || field.name === "excerpt" || field.name === "bio") {
        return (
          <div className="grid gap-2">
            <Label htmlFor={field.name}>{field.description}</Label>
            <Textarea
              id={field.name}
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.description}
              className="h-20"
            />
          </div>
        )
      }
      return (
        <div className="grid gap-2">
          <Label htmlFor={field.name}>{field.description}</Label>
          <Input
            id={field.name}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.description}
          />
        </div>
      )
  }
}
