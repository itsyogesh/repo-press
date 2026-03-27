/**
 * Shared image URL helpers for Studio controls.
 *
 * Accepts repo-relative paths and safe http(s) URLs, while rejecting
 * dangerous protocol URIs such as javascript:, data:, and file:.
 */
const EXPLICIT_PROTOCOL_REGEX = /^[a-z][a-z0-9+.-]*:/i

export function isSafeImageSrc(src: string): boolean {
  const trimmed = src.trim()
  if (!trimmed) return false

  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return true
  }

  if (EXPLICIT_PROTOCOL_REGEX.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      return url.protocol === "http:" || url.protocol === "https:"
    } catch {
      return false
    }
  }

  try {
    const url = new URL(`https://${trimmed}`)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return !trimmed.includes(":")
  }
}

export function normalizeExternalImageUrl(src: string): string {
  const trimmed = src.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return trimmed
  if (EXPLICIT_PROTOCOL_REGEX.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
