"use client"

import * as React from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { UNIVERSAL_FIELDS, buildMergedFieldList, normalizeDate } from "@/lib/framework-adapters"
import type { FieldVariantMap, FrontmatterFieldDef, MergedFieldDef } from "@/lib/framework-adapters"

import {
  headingsPlugin,
  quotePlugin,
  listsPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  tablePlugin,
  thematicBreakPlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  directivesPlugin,
  jsxPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  AdmonitionDirectiveDescriptor,
  type MDXEditorMethods,
} from '@mdxeditor/editor'

import '@mdxeditor/editor/style.css'
import './mdxeditor-theme.css'

import { ForwardRefEditor } from "./forward-ref-editor"
import { StudioToolbar } from "./studio-toolbar"
import { getJsxComponentDescriptors } from "./jsx-component-descriptors"

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
  const editorRef = React.useRef<MDXEditorMethods>(null)

  const schema = frontmatterSchema && frontmatterSchema.length > 0 ? frontmatterSchema : UNIVERSAL_FIELDS
  const mergedFields = React.useMemo(
    () => buildMergedFieldList(frontmatter, schema, fieldVariants),
    [frontmatter, schema, fieldVariants],
  )

  const fieldsInFile = mergedFields.filter((f) => f.isInFile)
  const emptySchemaFields = mergedFields.filter((f) => !f.isInFile)

  // No-op image upload handler (Phase 10 will implement actual upload)
  const handleImageUpload = React.useCallback(async (file: File): Promise<string> => {
    return URL.createObjectURL(file)
  }, [])

  // Build MDXEditor plugins — memoized to avoid re-creating on every render
  const plugins = React.useMemo(() => [
    headingsPlugin(),
    quotePlugin(),
    listsPlugin(),
    linkPlugin(),
    linkDialogPlugin({
      linkAutocompleteSuggestions: [],
    }),
    tablePlugin(),
    thematicBreakPlugin(),
    markdownShortcutPlugin(),
    codeBlockPlugin({ defaultCodeBlockLanguage: 'typescript' }),
    codeMirrorPlugin({
      codeBlockLanguages: {
        js: 'JavaScript',
        ts: 'TypeScript',
        tsx: 'TypeScript (JSX)',
        jsx: 'JSX',
        css: 'CSS',
        html: 'HTML',
        json: 'JSON',
        python: 'Python',
        bash: 'Bash',
        yaml: 'YAML',
        md: 'Markdown',
        sql: 'SQL',
        go: 'Go',
        rust: 'Rust',
        txt: 'Plain Text',
      },
    }),
    imagePlugin({
      imageUploadHandler: handleImageUpload,
      imageAutocompleteSuggestions: [],
    }),
    directivesPlugin({
      directiveDescriptors: [AdmonitionDirectiveDescriptor],
    }),
    jsxPlugin({
      jsxComponentDescriptors: getJsxComponentDescriptors(),
    }),
    diffSourcePlugin({
      diffMarkdown: '',
      viewMode: 'rich-text',
    }),
    toolbarPlugin({
      toolbarContents: () => <StudioToolbar />,
    }),
  ], [handleImageUpload])

  // Handle content change from editor
  const handleContentChange = React.useCallback((markdown: string) => {
    onChangeContent(markdown)
  }, [onChangeContent])

  // Sync content to MDXEditor when content changes externally (file switch)
  const lastSyncedContent = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (editorRef.current && content !== lastSyncedContent.current) {
      editorRef.current.setMarkdown(content)
      lastSyncedContent.current = content
    }
  }, [content])

  return (
    <div className="h-full flex flex-col">
      <div ref={scrollContainerRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        <div className="space-y-0">
          {/* Frontmatter Panel */}
          <Collapsible
            open={isFrontmatterOpen}
            onOpenChange={setIsFrontmatterOpen}
            className="border-b border-studio-border bg-studio-canvas"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-studio-border">
              <h3 className="text-xs font-semibold text-studio-fg uppercase tracking-wider">Properties</h3>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-9 p-0 h-6">
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
                <div className="border-t border-studio-border pt-3 mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-studio-fg-muted p-0 h-auto hover:text-studio-fg"
                    onClick={() => setShowEmptySchema(!showEmptySchema)}
                  >
                    {showEmptySchema ? (
                      <ChevronDown className="h-3 w-3 mr-1" />
                    ) : (
                      <ChevronRight className="h-3 w-3 mr-1" />
                    )}
                    Show {emptySchemaFields.length} available schema field{emptySchemaFields.length !== 1 ? "s" : ""}
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

          {/* MDXEditor */}
          <div className="min-h-[500px]">
            <ForwardRefEditor
              ref={editorRef}
              markdown={content}
              contentEditableClassName="prose prose-neutral dark:prose-invert max-w-none font-sans px-6 py-4 min-h-[500px] focus:outline-none"
              onChange={handleContentChange}
              plugins={plugins}
              className="mdxeditor-studio"
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
  const hasSchemaHint = field.actualFieldName !== field.name && field.description !== field.actualFieldName

  const labelEl = (
    <div>
      <Label htmlFor={id} className="font-semibold text-sm text-studio-fg">
        {field.actualFieldName}
      </Label>
      {hasSchemaHint && <p className="text-xs text-studio-fg-muted mt-0.5">{field.description}</p>}
    </div>
  )

  switch (field.type) {
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Checkbox id={id} checked={!!value} onCheckedChange={(checked) => onChange(checked)} />
          <div>
            <Label htmlFor={id} className="text-sm font-semibold text-studio-fg">
              {field.actualFieldName}
            </Label>
            {hasSchemaHint && <p className="text-xs text-studio-fg-muted">{field.description}</p>}
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
            className="border-studio-border"
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
            className="border-studio-border"
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
            className="border-studio-border"
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
            className="border-studio-border"
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
        return (
          <div className="grid gap-1">
            {labelEl}
            <Textarea
              id={id}
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.description}
              className="h-20 border-studio-border"
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
            className="border-studio-border"
          />
        </div>
      )
    }
  }
}
