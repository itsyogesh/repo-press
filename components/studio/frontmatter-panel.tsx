"use client"

import * as React from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { UNIVERSAL_FIELDS, buildMergedFieldList } from "@/lib/framework-adapters"
import type { FieldVariantMap, FrontmatterFieldDef } from "@/lib/framework-adapters"
import { FrontmatterField } from "./frontmatter-field"
import { IMAGE_EXTENSIONS } from "./shared-constants"

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
        {fieldsInFile.length === 0 ? (
          <p className="text-xs text-studio-fg-muted text-center py-2">No frontmatter fields in this file.</p>
        ) : (
          fieldsInFile.map((field) => (
            <FrontmatterField
              key={field.actualFieldName}
              field={field}
              value={frontmatter[field.actualFieldName]}
              onChange={(value) => onChangeFrontmatter(field.actualFieldName, value)}
              imagePaths={imagePaths}
            />
          ))
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
              Show {emptySchemaFields.length} more field
              {emptySchemaFields.length !== 1 ? "s" : ""}
              <span className="ml-1 text-studio-fg-muted/70 font-normal">
                ({emptySchemaFields.map((f) => f.name).join(", ")})
              </span>
            </Button>
            {showEmptySchema && (
              <div className="mt-3 space-y-4">
                {emptySchemaFields.map((field) => (
                  <FrontmatterField
                    key={field.actualFieldName}
                    field={field}
                    value={frontmatter[field.actualFieldName]}
                    onChange={(value) => onChangeFrontmatter(field.actualFieldName, value)}
                    imagePaths={imagePaths}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
