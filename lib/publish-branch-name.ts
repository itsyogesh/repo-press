import { posix as path } from "node:path"
import { slugify } from "./slug"

const DEFAULT_SCOPE = "multi-change"
const AREA_PREFIXES = new Set(["assets", "content", "images", "img", "media", "public", "static", "uploads"])
const RESERVED_FILE_STEMS = new Set(["index", "page", "readme"])
const MAX_SCOPE_LENGTH = 40

export function derivePublishBranchScope(paths: string[], contentRoot = "") {
  const uniquePaths = [...new Set(paths.map((value) => normalizePath(value)).filter(Boolean))]
  if (uniquePaths.length === 0) return DEFAULT_SCOPE
  if (uniquePaths.length === 1) return deriveSingleFileScope(uniquePaths[0], contentRoot)

  const areaLabels = [...new Set(uniquePaths.map((value) => deriveAreaScope(value, contentRoot)))]
  return areaLabels.length === 1 && areaLabels[0] !== DEFAULT_SCOPE ? areaLabels[0] : DEFAULT_SCOPE
}

export function buildPublishBranchName(scope: string, ordinal = 1) {
  const normalizedScope = clampScope(scope)
  return ordinal <= 1 ? `repopress/${normalizedScope}` : `repopress/${normalizedScope}-${ordinal}`
}

function deriveSingleFileScope(filePath: string, contentRoot: string) {
  const segments = stripContentRoot(filePath, contentRoot).split("/").filter(Boolean)
  if (segments.length === 0) return DEFAULT_SCOPE

  const fileName = segments[segments.length - 1]
  let scopeSource = path.parse(fileName).name
  if (RESERVED_FILE_STEMS.has(scopeSource.toLowerCase()) && segments.length > 1) {
    scopeSource = segments[segments.length - 2]
  }

  return clampScope(scopeSource)
}

function deriveAreaScope(filePath: string, contentRoot: string) {
  let segments = stripContentRoot(filePath, contentRoot).split("/").filter(Boolean)
  while (segments.length > 1 && AREA_PREFIXES.has(segments[0].toLowerCase())) {
    segments = segments.slice(1)
  }

  if (segments.length < 2) return DEFAULT_SCOPE
  return clampScope(segments[0])
}

function stripContentRoot(filePath: string, contentRoot: string) {
  const normalizedPath = normalizePath(filePath)
  const normalizedRoot = normalizePath(contentRoot)

  if (!normalizedRoot) return normalizedPath
  if (normalizedPath === normalizedRoot) return ""
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1)
  }

  return normalizedPath
}

function clampScope(value: string) {
  const slug = slugify(value)
  if (slug.length <= MAX_SCOPE_LENGTH) return slug
  const shortened = slug.slice(0, MAX_SCOPE_LENGTH).replace(/-+$/g, "")
  return shortened || DEFAULT_SCOPE
}

function normalizePath(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "")
}
