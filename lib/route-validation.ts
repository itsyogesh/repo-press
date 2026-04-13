/**
 * Validates GitHub owner/repo name format.
 * GitHub allows: alphanumeric, hyphens, dots, underscores (max 100 chars).
 */
export function isValidGitHubName(name: string): boolean {
  return /^[a-zA-Z0-9._-]{1,100}$/.test(name)
}

/**
 * Validates a file path for safety.
 * Rejects path traversal (..), absolute paths (starting with /),
 * null bytes, and other dangerous patterns.
 */
export function isValidFilePath(path: string): boolean {
  if (!path || path.startsWith("/")) return false
  const segments = path.split("/")
  return segments.every((seg) => seg !== ".." && seg !== "." && !seg.includes("\0"))
}
