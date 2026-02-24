// Single source of truth for all framework adapter types.

export type ContentType = "blog" | "docs" | "pages" | "changelog" | "custom"

export type FrontmatterFieldType =
  | "string"
  | "string[]"
  | "number"
  | "boolean"
  | "date"
  | "image"
  | "object"
  | "enum"

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
}
