import type { FieldSemanticRole, FieldVariantMap, FrontmatterFieldDef, FrontmatterFieldType } from "./types"

// Fallback field names for each semantic role
const FALLBACK_NAMES: Partial<Record<FieldSemanticRole, string[]>> = {
  title: ["heading", "name"],
  date: ["pubDate", "publishDate", "created", "createdAt"],
  lastModified: ["updatedDate", "lastmod", "updated", "lastUpdated", "modified"],
  image: ["coverImage", "cover", "heroImage", "hero", "thumbnail", "featuredImage", "og_image", "banner"],
  description: ["excerpt", "summary", "subtitle", "abstract"],
}

/**
 * Resolve a semantic role to a value from frontmatter.
 * Tries: framework-specific variant name -> role name -> common fallback names.
 */
export function resolveFieldValue(
  frontmatter: Record<string, unknown>,
  role: FieldSemanticRole,
  variants?: FieldVariantMap,
): unknown {
  // 1. Framework-specific variant name
  if (variants?.[role]) {
    const variantName = variants[role]
    if (variantName in frontmatter && frontmatter[variantName] != null) {
      return frontmatter[variantName]
    }
  }

  // 2. Role name directly
  if (role in frontmatter && frontmatter[role] != null) {
    return frontmatter[role]
  }

  // 3. Common fallback names
  const fallbacks = FALLBACK_NAMES[role]
  if (fallbacks) {
    for (const name of fallbacks) {
      if (name in frontmatter && frontmatter[name] != null) {
        return frontmatter[name]
      }
    }
  }

  return undefined
}

/**
 * Normalize Date objects (from gray-matter coercion) to YYYY-MM-DD strings.
 * Passes through valid date strings unchanged.
 */
export function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const d = String(value.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  if (typeof value === "string") {
    return value
  }
  return String(value ?? "")
}

/**
 * Normalize all Date instances in a frontmatter object to YYYY-MM-DD strings.
 */
export function normalizeFrontmatterDates(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    result[key] = value instanceof Date ? normalizeDate(value) : value
  }
  return result
}

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp|ico|tiff?)$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/

/**
 * Infer the FrontmatterFieldType from a runtime value.
 */
export function inferType(value: unknown): FrontmatterFieldType {
  if (typeof value === "boolean") return "boolean"
  if (typeof value === "number") return "number"
  if (Array.isArray(value)) return "string[]"
  if (value instanceof Date) return "date"
  if (typeof value === "object" && value !== null) return "object"
  if (typeof value === "string") {
    if (DATE_PATTERN.test(value)) return "date"
    if (IMAGE_EXTENSIONS.test(value)) return "image"
  }
  return "string"
}

/**
 * Find fields present in frontmatter that are NOT in the schema.
 * Returns inferred FrontmatterFieldDef[] for each extra field.
 */
export function findExtraFields(
  frontmatter: Record<string, unknown>,
  schema: FrontmatterFieldDef[],
): FrontmatterFieldDef[] {
  const schemaNames = new Set(schema.map((f) => f.name))
  const extras: FrontmatterFieldDef[] = []

  for (const [key, value] of Object.entries(frontmatter)) {
    if (schemaNames.has(key)) continue
    if (value == null) continue

    extras.push({
      name: key,
      type: inferType(value),
      required: false,
      description: key,
    })
  }

  return extras
}

// ─── Merged Field List (Studio V2) ────────────────────────────

export type MergedFieldDef = FrontmatterFieldDef & {
  /** The actual key used in the frontmatter object (may differ from schema name) */
  actualFieldName: string
  /** Whether this field exists in the current file's frontmatter */
  isInFile: boolean
}

/**
 * Reverse-resolve a semantic role to the actual key present in frontmatter.
 * Tries: variant name → role name → common fallback names.
 * Returns the matched key or undefined.
 */
export function findActualFieldName(
  frontmatter: Record<string, unknown>,
  role: FieldSemanticRole,
  variants?: FieldVariantMap,
): string | undefined {
  // 1. Framework-specific variant name
  if (variants?.[role]) {
    const variantName = variants[role]
    if (variantName in frontmatter) return variantName
  }

  // 2. Role name directly
  if (role in frontmatter) return role

  // 3. Common fallback names
  const fallbacks = FALLBACK_NAMES[role]
  if (fallbacks) {
    for (const name of fallbacks) {
      if (name in frontmatter) return name
    }
  }

  return undefined
}

/**
 * Build a merged field list: file-first fields enhanced with schema info,
 * followed by unmatched schema fields (collapsed in UI).
 *
 * Phase 1: Match schema fields to frontmatter keys via semantic roles + exact name
 * Phase 2: Add unmatched frontmatter keys with inferred types
 * Phase 3: Add unmatched schema fields (isInFile=false)
 */
export function buildMergedFieldList(
  frontmatter: Record<string, unknown>,
  schema: FrontmatterFieldDef[],
  variants?: FieldVariantMap,
): MergedFieldDef[] {
  const consumed = new Set<string>()
  const matchedSchemaIndices = new Set<number>()
  const fieldsInFile: MergedFieldDef[] = []

  // Phase 1: Match schema fields to frontmatter keys
  for (let i = 0; i < schema.length; i++) {
    const field = schema[i]
    let actualKey: string | undefined

    // Exact name match
    if (field.name in frontmatter) {
      actualKey = field.name
    }
    // Semantic role match
    else if (field.semanticRole) {
      actualKey = findActualFieldName(frontmatter, field.semanticRole, variants)
    }

    if (actualKey && !consumed.has(actualKey)) {
      consumed.add(actualKey)
      matchedSchemaIndices.add(i)
      fieldsInFile.push({
        ...field,
        actualFieldName: actualKey,
        isInFile: true,
        // Override type with inferred type if the value exists (more accurate for runtime)
        type: frontmatter[actualKey] != null ? inferType(frontmatter[actualKey]) : field.type,
      })
    }
  }

  // Phase 2: Add unmatched frontmatter keys
  for (const [key, value] of Object.entries(frontmatter)) {
    if (consumed.has(key)) continue
    if (value == null) continue

    fieldsInFile.push({
      name: key,
      actualFieldName: key,
      type: inferType(value),
      required: false,
      description: key,
      isInFile: true,
    })
  }

  // Phase 3: Add unmatched schema fields (not in file)
  const emptySchemaFields: MergedFieldDef[] = []
  for (let i = 0; i < schema.length; i++) {
    if (matchedSchemaIndices.has(i)) continue
    const field = schema[i]
    emptySchemaFields.push({
      ...field,
      actualFieldName: field.name,
      isInFile: false,
    })
  }

  return [...fieldsInFile, ...emptySchemaFields]
}

/**
 * Build a GitHub raw URL for an image path.
 * Absolute URLs (http/https) pass through unchanged.
 * Relative/repo-relative paths get resolved to raw.githubusercontent.com.
 */
export function buildGitHubRawUrl(
  imagePath: string,
  owner: string,
  repo: string,
  branch: string,
): string {
  if (!imagePath) return imagePath

  // Absolute URLs pass through
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath
  }

  // Strip leading slash for raw URL construction
  const cleanPath = imagePath.startsWith("/") ? imagePath.slice(1) : imagePath
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath}`
}
