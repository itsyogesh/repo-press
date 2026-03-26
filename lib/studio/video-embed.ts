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

export function getVideoInfo(url: string): VideoInfo {
  const trimmed = url.trim()
  if (!trimmed) return { provider: null, isValid: false }

  const youtubeMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.{11})/i)
  if (youtubeMatch) {
    const id = youtubeMatch[1]
    return {
      provider: "youtube",
      id,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      isValid: true,
    }
  }

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

  if (/\.(mp4|webm|mov|ogg|flv|mkv|avi|wmv|m4v)$/i.test(trimmed)) {
    return {
      provider: "direct",
      embedUrl: trimmed,
      isValid: true,
    }
  }

  try {
    const urlToTest = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
    new URL(urlToTest)
    return { provider: null, isValid: false }
  } catch {
    return { provider: null, isValid: false }
  }
}

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
