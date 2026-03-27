/**
 * Video URL detection and embedding utilities.
 */

export type VideoProvider = "youtube" | "vimeo" | "direct" | null

export interface VideoInfo {
  provider: VideoProvider
  id?: string
  embedUrl?: string
  isValid: boolean
}

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID_REGEX = /^\d+$/
const DIRECT_VIDEO_EXTENSION_REGEX = /\.(mp4|webm|mov|ogg|flv|mkv|avi|wmv|m4v)$/i
const SAFE_ABSOLUTE_VIDEO_PROTOCOLS = new Set(["http:", "https:"])
const RELATIVE_URL_BASE = "https://repopress.local"

function invalidVideoInfo(): VideoInfo {
  return { provider: null, isValid: false }
}

function hasExplicitProtocol(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

function hasDirectVideoExtension(value?: string | null): boolean {
  if (!value) return false

  const normalized = value.split(/[?#]/)[0] ?? value
  return DIRECT_VIDEO_EXTENSION_REGEX.test(normalized)
}

function tryParseAbsoluteUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function tryParseRelativeUrl(value: string): URL | null {
  try {
    return new URL(value, RELATIVE_URL_BASE)
  } catch {
    return null
  }
}

function isValidYouTubeId(value?: string | null): value is string {
  return Boolean(value && YOUTUBE_ID_REGEX.test(value))
}

function isValidVimeoId(value?: string | null): value is string {
  return Boolean(value && VIMEO_ID_REGEX.test(value))
}

function getPathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean)
}

function getYouTubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  const segments = getPathSegments(url.pathname)

  if (host === "youtu.be" || host === "www.youtu.be") {
    if (segments.length !== 1) return null
    return isValidYouTubeId(segments[0]) ? segments[0] : null
  }

  if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const videoId = url.searchParams.get("v")
      return isValidYouTubeId(videoId) ? videoId : null
    }

    if ((segments[0] === "embed" || segments[0] === "shorts") && segments.length === 2) {
      return isValidYouTubeId(segments[1]) ? segments[1] : null
    }
  }

  return null
}

function getVimeoId(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  const segments = getPathSegments(url.pathname)

  if ((host === "vimeo.com" || host === "www.vimeo.com") && segments.length === 1) {
    return isValidVimeoId(segments[0]) ? segments[0] : null
  }

  if (host === "player.vimeo.com" && segments[0] === "video" && segments.length === 2) {
    return isValidVimeoId(segments[1]) ? segments[1] : null
  }

  return null
}

function getDirectVideoEmbedUrl(trimmed: string): string | null {
  const absoluteUrl = tryParseAbsoluteUrl(trimmed)
  if (absoluteUrl) {
    if (!SAFE_ABSOLUTE_VIDEO_PROTOCOLS.has(absoluteUrl.protocol)) return null

    if (
      hasDirectVideoExtension(absoluteUrl.pathname) ||
      hasDirectVideoExtension(absoluteUrl.searchParams.get("path")) ||
      hasDirectVideoExtension(trimmed)
    ) {
      return trimmed
    }

    return null
  }

  if (hasExplicitProtocol(trimmed)) return null
  if (trimmed.startsWith("//")) return null

  const relativeUrl = tryParseRelativeUrl(trimmed)
  if (
    relativeUrl &&
    (hasDirectVideoExtension(relativeUrl.pathname) ||
      hasDirectVideoExtension(relativeUrl.searchParams.get("path")) ||
      hasDirectVideoExtension(trimmed))
  ) {
    return trimmed
  }

  return hasDirectVideoExtension(trimmed) ? trimmed : null
}

export function getVideoInfo(url: string): VideoInfo {
  const trimmed = url.trim()
  if (!trimmed) return invalidVideoInfo()

  const absoluteUrl = tryParseAbsoluteUrl(trimmed)
  if (absoluteUrl) {
    const youTubeId = getYouTubeId(absoluteUrl)
    if (youTubeId) {
      return {
        provider: "youtube",
        id: youTubeId,
        embedUrl: `https://www.youtube.com/embed/${youTubeId}`,
        isValid: true,
      }
    }

    const vimeoId = getVimeoId(absoluteUrl)
    if (vimeoId) {
      return {
        provider: "vimeo",
        id: vimeoId,
        embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
        isValid: true,
      }
    }
  }

  const directVideoUrl = getDirectVideoEmbedUrl(trimmed)
  if (directVideoUrl) {
    return {
      provider: "direct",
      embedUrl: directVideoUrl,
      isValid: true,
    }
  }

  try {
    const urlToTest = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
    new URL(urlToTest)
    return invalidVideoInfo()
  } catch {
    return invalidVideoInfo()
  }
}
