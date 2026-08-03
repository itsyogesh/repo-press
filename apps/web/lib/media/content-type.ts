const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  webm: "video/webm",
  mp4: "video/mp4",
  pdf: "application/pdf",
}

export function getContentType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop()
  return CONTENT_TYPES[ext || ""] || "application/octet-stream"
}
