/**
 * Video URL detection and embedding utilities.
 *
 * Detects video providers (YouTube, Vimeo, direct URLs) and provides
 * embed URLs and preview capabilities.
 */

export type VideoProvider = "youtube" | "vimeo" | "direct" | null

export interface VideoInfo {
  provider: VideoProvider
  id?: string
  embedUrl?: string
  isValid: boolean
}

/**
 * Extract video ID and provider from URL.
 *
 * Supports:
 * - YouTube: https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID
 * - Vimeo: https://vimeo.com/VIDEO_ID
 * - Direct: .mp4, .webm, .mov, etc.
 */
export function getVideoInfo(url: string): VideoInfo {
  const trimmed = url.trim()
  if (!trimmed) return { provider: null, isValid: false }

  // YouTube patterns
  const youtubeMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.{11})/i,
  )
  if (youtubeMatch) {
    const id = youtubeMatch[1]
    return {
      provider: "youtube",
      id,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      isValid: true,
    }
  }

  // Vimeo pattern
  const vimeoMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/i)
  if (vimeoMatch) {
    const id = vimeoMatch[1]
    return {
      provider: "vimeo",
      id,
      embedUrl: `https://player.vimeo.com/video/${id}`,
      isValid: true,
    }
  }

  // Direct video file
  if (/\.(mp4|webm|mov|ogg|flv|mkv|avi|wmv|m4v)$/i.test(trimmed)) {
    return {
      provider: "direct",
      embedUrl: trimmed,
      isValid: true,
    }
  }

  // Check if it looks like a URL but didn't match any provider
  try {
    // Add https:// if missing protocol
    const urlToTest = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
    new URL(urlToTest)
    // It's a valid URL, but not a recognized video provider
    return { provider: null, isValid: false }
  } catch {
    // Not a valid URL at all
    return { provider: null, isValid: false }
  }
}

/**
 * Get HTML iframe or video element for embedding.
 */
export function getVideoEmbedHTML(info: VideoInfo): string {
  if (!info.isValid || !info.embedUrl) return ""

  switch (info.provider) {
    case "youtube":
      return `<iframe width="100%" height="315" src="${info.embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`

    case "vimeo":
      return `<iframe src="${info.embedUrl}" width="100%" height="315" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`

    case "direct":
      return `<video width="100%" height="auto" controls style="max-height: 400px;"><source src="${info.embedUrl}" type="video/mp4">Your browser does not support the video tag.</video>`

    default:
      return ""
  }
}

/**
 * Get text description of video provider.
 */
export function getVideoProviderLabel(provider: VideoProvider): string {
  switch (provider) {
    case "youtube":
      return "YouTube"
    case "vimeo":
      return "Vimeo"
    case "direct":
      return "Direct Video File"
    default:
      return "Unknown"
  }
}
