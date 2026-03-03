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

export function buildMediaResolveUrl(projectId: string, path: string): string {
  const repoPath = normalizeRepoMediaPath(path)
  return `/api/media/resolve?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(repoPath)}`
}

export function resolveStudioAssetUrl(path: string, projectId?: string): string {
  if (!path) return path
  if (isAbsoluteUrl(path) || isStudioMediaResolveUrl(path)) return path
  if (!projectId) return path
  return buildMediaResolveUrl(projectId, path)
}
