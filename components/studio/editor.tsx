"use client"

import * as React from "react"

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

import type { FieldVariantMap, FrontmatterFieldDef } from "@/lib/framework-adapters"
import { ForwardRefEditor } from "./forward-ref-editor"
import { StudioToolbar } from "./studio-toolbar"
import { getJsxComponentDescriptors } from "./jsx-component-descriptors"
import { FrontmatterPanel } from "./frontmatter-panel"

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
  const editorRef = React.useRef<MDXEditorMethods>(null)

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
          {/* Frontmatter Panel (Phase 6) */}
          <FrontmatterPanel
            frontmatter={frontmatter}
            frontmatterSchema={frontmatterSchema}
            fieldVariants={fieldVariants}
            onChangeFrontmatter={onChangeFrontmatter}
          />

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
