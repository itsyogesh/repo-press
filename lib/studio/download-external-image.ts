import type { UploadMediaResult } from "./media-upload"

export interface DownloadExternalImageOptions {
  url: string
  projectId: string
  userId?: string
  owner: string
  repo: string
  branch?: string
  pathHint?: string
  fileName?: string
  sourceFilePath?: string
}

export async function downloadExternalImage({
  url,
  projectId,
  userId,
  owner,
  repo,
  branch,
  pathHint,
  fileName,
  sourceFilePath,
}: DownloadExternalImageOptions): Promise<UploadMediaResult> {
  const response = await fetch("/api/media/download-external", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      projectId,
      userId,
      owner,
      repo,
      branch,
      pathHint,
      fileName,
      sourceFilePath,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "External image download failed" }))
    throw new Error(error.error || "External image download failed")
  }

  const result = (await response.json()) as UploadMediaResult
  if (!result.url) {
    result.url = result.previewUrl
  }
  return result
}
