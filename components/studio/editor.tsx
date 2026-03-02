"use client"

import {
  AdmonitionDirectiveDescriptor,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  directivesPlugin,
  headingsPlugin,
  imagePlugin,
  jsxPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  type MDXEditorMethods,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor"
import * as React from "react"

import "@mdxeditor/editor/style.css"
import "./mdxeditor-theme.css"

import type { FieldVariantMap, FrontmatterFieldDef } from "@/lib/framework-adapters"
import { EditorErrorFallback } from "./error-boundary"
import { ForwardRefEditor } from "./forward-ref-editor"
import { FrontmatterPanel } from "./frontmatter-panel"
import { getJsxComponentDescriptors } from "./jsx-component-descriptors"
import { IMAGE_EXTENSIONS } from "./shared-constants"
import { useStudioAdapter } from "./studio-adapter-context"
import { StudioToolbar } from "./studio-toolbar"

// Error boundary for MDXEditor
class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode; resetKey: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode; resetKey: string }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    console.error("MDXEditor parsing error:", error)
  }

  componentDidUpdate(prevProps: { children: React.ReactNode; fallback: React.ReactNode; resetKey: string }): void {
    // Reset only when content/file context changes, not on every render while crashing.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

const YouTubeDirectiveDescriptor = {
  name: "youtube",
  type: "leafDirective" as const,
  testNode: (node: { name?: string }) => node.name === "youtube",
  attributes: [],
  hasChildren: false,
  Editor: () => null,
}

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
  owner: string
  repo: string
  branch: string
  filePath?: string
  contentRoot?: string
  tree?: { path: string; type: string }[]
}

export function Editor({
  content,
  frontmatter,
  frontmatterSchema,
  fieldVariants,
  onChangeContent,
  onChangeFrontmatter,
  onSaveDraft: _onSaveDraft,
  onPublish: _onPublish,
  isSaving: _isSaving,
  isPublishing: _isPublishing,
  canPublish: _canPublish,
  statusBadge: _statusBadge,
  scrollContainerRef,
  onScroll,
  owner,
  repo,
  branch,
  filePath = "",
  contentRoot: _contentRoot = "",
  tree = [],
}: EditorProps) {
  const { adapter, components: componentSchema } = useStudioAdapter()
  const editorRef = React.useRef<MDXEditorMethods>(null)

  // Determine image upload path based on project structure
  const getImageUploadPath = React.useCallback(
    (fileName: string): string => {
      const possibleDirs = ["public/images", "static/images", "images", "assets/images", "src/assets/images"]

      const existingDirs = possibleDirs.filter((dir) =>
        tree.some((node) => node.type === "dir" && (node.path === dir || node.path.startsWith(`${dir}/`))),
      )

      const baseDir = existingDirs[0] || "public/images"
      return `${baseDir}/${fileName}`
    },
    [tree],
  )

  // Image upload handler - uploads to GitHub via API
  const handleImageUpload = React.useCallback(
    async (file: File): Promise<string> => {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""))

        const fileName = file.name || `image-${Date.now()}.png`
        const imagePath = getImageUploadPath(fileName)

        const response = await fetch("/api/github/upload-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            owner,
            repo,
            path: imagePath,
            content: base64,
            message: `Upload image: ${fileName} via RepoPress`,
            branch,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          console.error("Image upload failed:", error)
          throw new Error(error.error || "Failed to upload image")
        }

        const result = await response.json()
        return result.path || imagePath
      } catch (error) {
        console.error("Error uploading image:", error)
        throw error
      }
    },
    [owner, repo, branch, getImageUploadPath],
  )

  // Extract image paths from tree for autocomplete
  const imageAutocompleteSuggestions = React.useMemo(() => {
    return tree
      .filter((node) => node.type === "file" && IMAGE_EXTENSIONS.some((ext) => node.path.toLowerCase().endsWith(ext)))
      .map((node) => node.path)
  }, [tree])

  // Build MDXEditor plugins — memoized to avoid re-creating on every render
  const plugins = React.useMemo(
    () => [
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
      codeBlockPlugin({ defaultCodeBlockLanguage: "typescript" }),
      codeMirrorPlugin({
        codeBlockLanguages: {
          js: "JavaScript",
          ts: "TypeScript",
          tsx: "TypeScript (JSX)",
          jsx: "JSX",
          css: "CSS",
          html: "HTML",
          json: "JSON",
          python: "Python",
          bash: "Bash",
          yaml: "YAML",
          md: "Markdown",
          sql: "SQL",
          go: "Go",
          rust: "Rust",
          txt: "Plain Text",
        },
      }),
      imagePlugin({
        imageUploadHandler: handleImageUpload,
        imageAutocompleteSuggestions,
      }),
      directivesPlugin({
        directiveDescriptors: [AdmonitionDirectiveDescriptor, YouTubeDirectiveDescriptor],
      }),
      jsxPlugin({
        jsxComponentDescriptors: getJsxComponentDescriptors(adapter?.components, componentSchema),
      }),
      diffSourcePlugin({
        diffMarkdown: "",
        viewMode: "rich-text",
      }),
      toolbarPlugin({
        toolbarContents: () => <StudioToolbar />,
      }),
    ],
    [handleImageUpload, imageAutocompleteSuggestions, adapter, componentSchema],
  )

  // Handle content change from editor
  const handleContentChange = React.useCallback(
    (markdown: string) => {
      onChangeContent(markdown)
    },
    [onChangeContent],
  )

  // Sanitize markdown to fix MDXEditor parsing issues
  // Removes empty code blocks that cause "Parsing failed: {type:code,name:N/A}" errors
  // Always sanitize to handle content typed in Source mode as well
  const sanitizedContent = React.useMemo(() => {
    // Sanitize: remove empty code blocks (``` with any newlines/whitespace between them)
    let sanitized = content.replace(/```[\s\n]*```/g, "")

    // Also clean up multiple consecutive blank lines that might result
    sanitized = sanitized.replace(/\n{3,}/g, "\n\n")

    return sanitized
  }, [content])

  const errorBoundaryResetKey = React.useMemo(() => `${filePath}:${sanitizedContent}`, [filePath, sanitizedContent])

  // Sync content to MDXEditor when content changes externally (file switch)
  const lastSyncedContent = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (editorRef.current && sanitizedContent !== lastSyncedContent.current) {
      editorRef.current.setMarkdown(sanitizedContent)
      lastSyncedContent.current = sanitizedContent
    }
  }, [sanitizedContent])

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
            tree={tree}
          />

          {/* MDXEditor */}
          <div className="min-h-[500px]">
            <EditorErrorBoundary
              resetKey={errorBoundaryResetKey}
              fallback={
                <EditorErrorFallback
                  content={content}
                  onOpenSource={() => {
                    // The error boundary will automatically reset when content changes
                    // This is handled in componentDidUpdate
                  }}
                  onCopy={() => {
                    navigator.clipboard.writeText(content)
                  }}
                />
              }
            >
              <ForwardRefEditor
                ref={editorRef}
                key={filePath || "empty"}
                markdown={sanitizedContent}
                contentEditableClassName="prose prose-neutral dark:prose-invert max-w-none font-sans px-6 py-4 min-h-[500px] focus:outline-none"
                onChange={handleContentChange}
                plugins={plugins}
                className="mdxeditor-studio"
              />
            </EditorErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  )
}
