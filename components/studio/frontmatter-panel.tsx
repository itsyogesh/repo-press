"use client"

import { ChevronDown, ChevronRight } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type {
  FieldGroup,
  FieldVariantMap,
  FrontmatterFieldDef,
  GroupedField,
  MergedFieldDef,
} from "@/lib/framework-adapters"
import { buildMergedFieldList, UNIVERSAL_FIELDS } from "@/lib/framework-adapters"
import { FrontmatterField } from "./frontmatter-field"
import { IMAGE_EXTENSIONS } from "./shared-constants"

const FIELD_GROUP_MAP: Record<string, FieldGroup> = {
  title: "basic",
  heading: "basic",
  date: "basic",
  description: "basic",
  excerpt: "basic",
  draft: "basic",
  author: "basic",
  authors: "basic",
  tags: "basic",
  categories: "basic",
  slug: "basic",
  order: "basic",
  metaTitle: "seo",
  metaDescription: "seo",
  focusKeyword: "seo",
  canonicalUrl: "seo",
  metaRobots: "seo",
  lastUpdatedDate: "seo",
  lastUpdated: "seo",
  image: "coverImage",
  imageLink: "coverImage",
  imageAltText: "coverImage",
  ogTitle: "openGraph",
  ogDescription: "openGraph",
  ogImage: "openGraph",
  twitterTitle: "twitter",
  twitterDescription: "twitter",
  twitterImage: "twitter",
  schemaType: "schema",
}

const GROUP_LABELS: Record<FieldGroup, string> = {
  basic: "Basic",
  seo: "SEO",
  coverImage: "Cover Image",
  openGraph: "Open Graph",
  twitter: "Twitter",
  schema: "Schema",
  other: "Other",
}

function groupMergedFields(fields: MergedFieldDef[]): GroupedField<MergedFieldDef>[] {
  const groups: Record<FieldGroup, MergedFieldDef[]> = {
    basic: [],
    seo: [],
    coverImage: [],
    openGraph: [],
    twitter: [],
    schema: [],
    other: [],
  }

  for (const field of fields) {
    const group = FIELD_GROUP_MAP[field.actualFieldName] || FIELD_GROUP_MAP[field.name] || "other"
    groups[group].push(field)
  }

  const order: FieldGroup[] = ["basic", "seo", "coverImage", "openGraph", "twitter", "schema", "other"]
  return order
    .filter((g) => groups[g].length > 0)
    .map((g) => ({
      group: g,
      groupLabel: GROUP_LABELS[g],
      fields: groups[g],
    }))
}

interface FrontmatterPanelProps {
  frontmatter: Record<string, any>
  frontmatterSchema?: FrontmatterFieldDef[]
  fieldVariants?: FieldVariantMap
  onChangeFrontmatter: (key: string, value: any) => void
  tree?: { path: string; type: string }[]
}

export function FrontmatterPanel({
  frontmatter,
  frontmatterSchema,
  fieldVariants,
  onChangeFrontmatter,
  tree = [],
}: FrontmatterPanelProps) {
  const [isOpen, setIsOpen] = React.useState(true)
  const [showEmptySchema, setShowEmptySchema] = React.useState(false)

  const schema = frontmatterSchema && frontmatterSchema.length > 0 ? frontmatterSchema : UNIVERSAL_FIELDS
  const mergedFields = React.useMemo(
    () => buildMergedFieldList(frontmatter, schema, fieldVariants),
    [frontmatter, schema, fieldVariants],
  )

  const fieldsInFile = mergedFields.filter((f) => f.isInFile)
  const emptySchemaFields = mergedFields.filter((f) => !f.isInFile)

  // Extract image paths from tree for the image field
  const imagePaths = React.useMemo(() => {
    return tree
      .filter((node) => node.type === "file" && IMAGE_EXTENSIONS.some((ext) => node.path.toLowerCase().endsWith(ext)))
      .map((node) => node.path)
  }, [tree])

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b border-studio-border bg-studio-canvas">
      <div className="flex items-center justify-between px-4 py-2 border-b border-studio-border">
        <h3 className="text-xs font-semibold text-studio-fg uppercase tracking-wider flex items-center gap-2">
          Properties
          {fieldsInFile.length > 0 && (
            <span className="text-studio-fg-muted font-normal normal-case">
              ({fieldsInFile.length} field{fieldsInFile.length !== 1 ? "s" : ""})
            </span>
          )}
        </h3>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-9 p-0 h-6 text-studio-fg-muted hover:text-studio-fg">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="sr-only">Toggle Properties</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="px-4 py-3 space-y-4">
        {fieldsInFile.length > 0 ? (
          groupMergedFields(fieldsInFile).map((grouped) => (
            <div key={grouped.group}>
              <div className="text-xs font-semibold text-studio-fg-muted uppercase tracking-wider mb-2 pb-1 border-b border-studio-border">
                {grouped.groupLabel}
              </div>
              <div className="space-y-4">
                {grouped.fields.map((field) => (
                  <FrontmatterField
                    key={field.actualFieldName}
                    field={field}
                    value={frontmatter[field.actualFieldName]}
                    onChange={(value) => onChangeFrontmatter(field.actualFieldName, value)}
                    imagePaths={imagePaths}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-studio-fg-muted text-center py-2">
            {emptySchemaFields.length > 0
              ? "No fields with values. Expand fields below to add."
              : "No frontmatter fields in this file."}
          </p>
        )}

        {emptySchemaFields.length > 0 && (
          <div className="border-t border-studio-border pt-3 mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-studio-fg-muted p-0 h-auto hover:text-studio-fg"
              onClick={() => setShowEmptySchema(!showEmptySchema)}
            >
              {showEmptySchema ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
              Show {emptySchemaFields.length} empty field
              {emptySchemaFields.length !== 1 ? "s" : ""}
              <span className="ml-1 text-studio-fg-muted/70 font-normal">
                ({emptySchemaFields.map((f) => f.name).join(", ")})
              </span>
            </Button>
            {showEmptySchema && (
              <div className="mt-3 space-y-4">
                {groupMergedFields(emptySchemaFields).map((grouped) => (
                  <div key={`empty-${grouped.group}`}>
                    <div className="text-xs font-semibold text-studio-fg-muted uppercase tracking-wider mb-2 pb-1 border-b border-studio-border">
                      {grouped.groupLabel}
                    </div>
                    <div className="space-y-4">
                      {grouped.fields.map((field) => (
                        <FrontmatterField
                          key={field.actualFieldName}
                          field={field}
                          value={frontmatter[field.actualFieldName]}
                          onChange={(value) => onChangeFrontmatter(field.actualFieldName, value)}
                          imagePaths={imagePaths}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
