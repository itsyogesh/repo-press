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
import { resolveStudioAssetUrl } from "@/lib/studio/media-resolve"
import { uploadMedia } from "@/lib/studio/media-upload"
import { shouldResetEditorBoundary } from "./editor-error-boundary-utils"
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
  constructor(props: {
    children: React.ReactNode
    fallback: React.ReactNode
    resetKey: string
  }) {
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
    if (shouldResetEditorBoundary(this.state.hasError, prevProps.resetKey, this.props.resetKey)) {
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
  projectId?: string
  userId?: string
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
  projectId,
  userId,
  filePath = "",
  contentRoot: _contentRoot = "",
  tree = [],
}: EditorProps) {
  const { adapter, components: componentSchema } = useStudioAdapter()
  const editorRef = React.useRef<MDXEditorMethods>(null)

  const discoveredJsxComponentNames = React.useMemo(() => {
    const names = new Set<string>()
    const componentTagRegex = /<\/?([A-Z][A-Za-z0-9_]*)\b/g
    for (const match of content.matchAll(componentTagRegex)) {
      const name = match[1]
      if (name) {
        names.add(name)
      }
    }

    return Array.from(names)
  }, [content])

  const hasConfiguredMediaComponent = React.useMemo(() => {
    const configuredNames = new Set([...Object.keys(adapter?.components || {}), ...Object.keys(componentSchema || {})])

    return (
      configuredNames.has("DocsImage") ||
      configuredNames.has("Image") ||
      configuredNames.has("DocsVideo") ||
      configuredNames.has("Video")
    )
  }, [adapter, componentSchema])

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

  // Image upload handler - Blob-first with GitHub fallback
  const handleImageUpload = React.useCallback(
    async (file: File): Promise<string> => {
      try {
        if (!projectId) {
          throw new Error("Missing project context for media upload")
        }
        const fileName = file.name || `image-${Date.now()}.png`
        const pathHint = getImageUploadPath(fileName).split("/").slice(0, -1).join("/")

        // Use Blob-first upload with GitHub fallback
        const result = await uploadMedia({
          file,
          projectId,
          userId,
          owner,
          repo,
          branch,
          pathHint,
          storagePreference: "auto",
        })

        return result.repoPath
      } catch (error) {
        console.error("Error uploading image:", error)
        throw error
      }
    },
    [projectId, userId, owner, repo, branch, getImageUploadPath],
  )

  // Extract image paths from tree for autocomplete
  const imageAutocompleteSuggestions = React.useMemo(() => {
    return tree
      .filter((node) => node.type === "file" && IMAGE_EXTENSIONS.some((ext) => node.path.toLowerCase().endsWith(ext)))
      .map((node) => node.path)
  }, [tree])

  const handleImagePreview = React.useCallback(
    async (imageSource: string): Promise<string> => {
      return resolveStudioAssetUrl(imageSource, projectId, userId, filePath)
    },
    [projectId, userId, filePath],
  )

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
      codeBlockPlugin({ defaultCodeBlockLanguage: "ts" }),
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
        imagePreviewHandler: handleImagePreview,
      }),
      directivesPlugin({
        directiveDescriptors: [AdmonitionDirectiveDescriptor, YouTubeDirectiveDescriptor],
      }),
      jsxPlugin({
        jsxComponentDescriptors: getJsxComponentDescriptors(
          adapter?.components,
          componentSchema,
          discoveredJsxComponentNames,
        ),
      }),
      diffSourcePlugin({
        diffMarkdown: "",
        viewMode: "rich-text",
      }),
      toolbarPlugin({
        toolbarContents: () => (
          <StudioToolbar
            owner={owner}
            repo={repo}
            branch={branch}
            projectId={projectId}
            userId={userId}
            showMarkdownMediaInserts={!hasConfiguredMediaComponent}
          />
        ),
      }),
    ],
    [
      handleImageUpload,
      imageAutocompleteSuggestions,
      handleImagePreview,
      adapter,
      componentSchema,
      discoveredJsxComponentNames,
      owner,
      repo,
      branch,
      projectId,
      userId,
      hasConfiguredMediaComponent,
    ],
  )

  // Handle content change from editor
  const handleContentChange = React.useCallback(
    (markdown: string) => {
      onChangeContent(markdown)
    },
    [onChangeContent],
  )

  // Keep editor content lossless: stripping empty code fences breaks "Insert code block".
  const sanitizedContent = React.useMemo(() => content, [content])

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
          <div className="min-h-[500px]" data-scroll-sync-root="editor">
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
