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

function resolvePathAgainstBase(path: string, baseFilePath?: string): string {
  const trimmed = path.trim().replace(/\\/g, "/")
  if (!trimmed) return trimmed
  if (trimmed.startsWith("/")) return normalizeRepoMediaPath(trimmed)

  const pathSegments = trimmed.split("/")
  const hasRelativePrefix = pathSegments[0] === "." || pathSegments[0] === ".."
  const isBareFileName = !trimmed.includes("/")
  const isLikelyMediaFile = /\.(?:png|jpe?g|gif|webp|svg|mp4|webm|pdf)$/i.test(trimmed)
  const normalizedBase = baseFilePath?.trim().replace(/^\/+/, "") || ""

  if (isBareFileName && isLikelyMediaFile) {
    const blogMatch = normalizedBase.match(/^content\/blog\/([^/]+)\.(?:md|mdx|markdown)$/i)
    if (blogMatch?.[1]) {
      return normalizeRepoMediaPath(`images/blog/${blogMatch[1]}/${trimmed}`)
    }
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

export function buildMediaResolveUrl(projectId: string, path: string, userId?: string, baseFilePath?: string): string {
  const repoPath = resolvePathAgainstBase(path, baseFilePath)
  const searchParams = new URLSearchParams({
    projectId,
    path: repoPath,
  })
  if (userId) {
    searchParams.set("userId", userId)
  }
  return `/api/media/resolve?${searchParams.toString()}`
}

export function resolveStudioAssetUrl(
  path: string,
  projectId?: string,
  userId?: string,
  baseFilePath?: string,
): string {
  if (!path) return path
  if (isAbsoluteUrl(path) || isStudioMediaResolveUrl(path)) return path
  if (!projectId) return path
  return buildMediaResolveUrl(projectId, path, userId, baseFilePath)
}
