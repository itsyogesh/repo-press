export function isAbsoluteUrl(path: string): boolean {
  return path.startsWith("http://") || path.startsWith("https://")
}

export function isStudioMediaResolveUrl(path: string): boolean {
  return path.startsWith("/api/media/resolve?")
}

export function normalizeRepoMediaPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return trimmed
  const withoutDotSlash = trimmed.replace(/^\.\//, "")
  return withoutDotSlash.startsWith("/") ? withoutDotSlash : `/${withoutDotSlash}`
}

function resolvePathAgainstBase(path: string, baseFilePath?: string, contentRoot?: string): string {
  const trimmed = path.trim().replace(/\\/g, "/")
  if (!trimmed) return trimmed
  if (trimmed.startsWith("/")) return normalizeRepoMediaPath(trimmed)

  const pathSegments = trimmed.split("/")
  const hasRelativePrefix = pathSegments[0] === "." || pathSegments[0] === ".."
  const isBareFileName = !trimmed.includes("/")
  const isLikelyMediaFile = /\.(?:png|jpe?g|gif|webp|svg|mp4|webm|pdf)$/i.test(trimmed)
  const normalizedBase = baseFilePath?.trim().replace(/^\/+/, "") || ""

  if (isBareFileName && isLikelyMediaFile && normalizedBase && contentRoot !== undefined) {
    const imageFolder = getSuggestedImagePath(normalizedBase, contentRoot)
    return normalizeRepoMediaPath(`${imageFolder}/${trimmed}`)
  }

  if (!baseFilePath || (!hasRelativePrefix && !isBareFileName)) {
    return normalizeRepoMediaPath(trimmed)
  }

  const baseSegments = baseFilePath.trim().replace(/^\/+/, "").split("/").slice(0, -1)

  for (const segment of pathSegments) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (baseSegments.length > 0) {
        baseSegments.pop()
      }
      continue
    }
    baseSegments.push(segment)
  }

  return normalizeRepoMediaPath(baseSegments.join("/"))
}

export function buildMediaResolveUrl(
  projectId: string,
  path: string,
  userId?: string,
  baseFilePath?: string,
  projectAccessToken?: string,
  contentRoot?: string,
): string {
  const repoPath = resolvePathAgainstBase(path, baseFilePath, contentRoot)
  const searchParams = new URLSearchParams({
    projectId,
    path: repoPath,
  })
  if (userId) {
    searchParams.set("userId", userId)
  }
  if (projectAccessToken) {
    searchParams.set("projectAccessToken", projectAccessToken)
  }
  return `/api/media/resolve?${searchParams.toString()}`
}

export function resolveStudioAssetUrl(
  path: string,
  projectId?: string,
  userId?: string,
  baseFilePath?: string,
  projectAccessToken?: string,
  contentRoot?: string,
): string {
  if (!path) return path
  if (isAbsoluteUrl(path) || isStudioMediaResolveUrl(path)) return path
  if (!projectId) return path
  return buildMediaResolveUrl(projectId, path, userId, baseFilePath, projectAccessToken, contentRoot)
}

/**
 * Derives a suggested media folder based on the document path and project content root.
 * Strips the contentRoot prefix from filePath, removes the file extension, then mirrors
 * the remaining slug under public/images/. The last meaningful segment of contentRoot
 * (e.g. "blog" from "content/blog") is included as a namespace unless it is a generic
 * aggregator like "content" or the root is empty.
 *
 * Examples:
 *   ("content/blog/my-post.mdx", "content/blog") → "public/images/blog/my-post"
 *   ("content/blog/my-post.mdx", "content")      → "public/images/blog/my-post"
 *   ("apps/docs/content/intro.mdx", "apps/docs/content") → "public/images/intro"
 *   ("docs/intro.mdx", "")                        → "public/images/docs/intro"
 */
export function getSuggestedImagePath(documentPath: string, contentRoot: string): string {
  const file = documentPath.trim().replace(/^\/+/, "").replace(/\\/g, "/")
  const root = (contentRoot ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "")

  const fileNoExt = file.replace(/\.[^/.]+$/, "")

  let slugPath: string
  if (root && fileNoExt.startsWith(`${root}/`)) {
    slugPath = fileNoExt.slice(root.length + 1)
  } else {
    slugPath = fileNoExt
  }

  const rootSegments = root ? root.split("/") : []
  const lastSegment = rootSegments[rootSegments.length - 1] ?? ""

  // Skip the namespace when: no last segment, it's a generic aggregator ("content"),
  // or the slug already begins with it (avoids double-pathing).
  const imageNs = lastSegment && lastSegment !== "content" && !slugPath.startsWith(`${lastSegment}/`) ? lastSegment : ""

  const imagePath = [imageNs, slugPath].filter(Boolean).join("/")
  return `public/images/${imagePath}`
}
