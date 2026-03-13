// Single source of truth for all framework adapter types.

export type ContentType = "blog" | "docs" | "pages" | "changelog" | "custom"

export type FrontmatterFieldType = "string" | "string[]" | "number" | "boolean" | "date" | "image" | "object" | "enum"

export type FrontmatterFieldDef = {
  name: string
  type: FrontmatterFieldType
  required: boolean
  description: string
  defaultValue?: unknown
  options?: string[]
  semanticRole?: FieldSemanticRole
}

export type FieldSemanticRole =
  | "title"
  | "date"
  | "lastModified"
  | "description"
  | "image"
  | "author"
  | "authors"
  | "tags"
  | "categories"
  | "draft"
  | "slug"
  | "layout"
  | "order"
  | "excerpt"

export type FieldVariantMap = Partial<Record<FieldSemanticRole, string>>

export type DetectionContext = {
  deps: Record<string, string>
  packageJson: Record<string, unknown> | null
  rootFileNames: string[]
  readFile: (path: string) => Promise<string | null>
  /** The project's content root path (empty string for repo root) */
  contentRoot: string
  /** File names in the content root folder (empty if contentRoot is repo root) */
  contentRootFileNames: string[]
}

export type DetectionResult = {
  score: number
  contentType: ContentType
  suggestedContentRoots?: string[]
}

export type ContentArchitectureInfo = {
  hasReferenceTypes?: boolean
  hasComputedFields?: boolean
  hasTaxonomySystem?: boolean
  hasConfigSchema?: boolean
  fileNamingPattern?: string
  architectureNote?: string
}

/**
 * How filenames are derived from a user-supplied title.
 *
 * - "slug"           → `{slug}{ext}`  (e.g. my-post.mdx)
 * - "index-if-empty" → `{slug}/index{ext}` when the folder has no children yet,
 *                      otherwise `{slug}{ext}` (used by Fumadocs / Hugo page bundles)
 * - "date-slug"      → `YYYY-MM-DD-{slug}{ext}` (Jekyll _posts convention)
 */
export type NamingStrategy = "slug" | "index-if-empty" | "date-slug"

export type FrameworkAdapter = {
  id: string
  displayName: string
  detect: (ctx: DetectionContext) => Promise<DetectionResult> | DetectionResult
  /** Optional folder-level detection that runs when a contentRoot is specified. Score adds to repo-level score. */
  detectInFolder?: (ctx: DetectionContext) => Promise<DetectionResult> | DetectionResult
  defaultContentRoots: string[]
  fields: FrontmatterFieldDef[]
  fieldVariants: FieldVariantMap
  metaFilePattern: string | null
  contentArchitecture?: ContentArchitectureInfo
  /** Path to the MDX preview adapter file (relative to repo root) */
  previewEntry?: string | null
  /** How filenames are derived from the user-supplied title. Defaults to "slug" when absent. */
  namingStrategy?: NamingStrategy
  /** Default file extension for new content files. Defaults to ".mdx" when absent. */
  fileExtension?: ".mdx" | ".md"
}

export type FrameworkConfig = {
  framework: string
  displayName: string
  contentType: ContentType
  suggestedContentRoots: string[]
  frontmatterFields: FrontmatterFieldDef[]
  fieldVariants: FieldVariantMap
  metaFilePattern: string | null
  contentArchitecture?: ContentArchitectureInfo
  /** Path to the MDX preview adapter file (relative to repo root) */
  previewEntry?: string | null
}
