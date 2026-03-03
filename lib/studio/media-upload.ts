// ---------------------------------------------------------------------------
// Media Upload — client-side helper
// ---------------------------------------------------------------------------
//
// Provides uploadMedia() function that calls /api/media/upload.
// Uses Blob-first strategy with GitHub fallback per plan.
//
// Usage:
//   const result = await uploadMedia({
//     file,
//     projectId: "project_id",
//     owner: "owner",
//     repo: "repo",
//     branch: "main",
//     storagePreference: "auto", // "auto" | "blob" | "github"
//   })
//   // Persist result.repoPath in MDX src
// ---------------------------------------------------------------------------

export type StoragePreference = "auto" | "blob" | "github"

export interface UploadMediaOptions {
  /** The file to upload. */
  file: File
  /** Project identifier used for ownership checks and staging records. */
  projectId: string
  /** Optional user ID fallback for PAT flows without auth session cookies. */
  userId?: string
  /** Repository owner (username or org). */
  owner: string
  /** Repository name. */
  repo: string
  /** Target branch. */
  branch: string
  /** Optional path hint for GitHub fallback (e.g., "public/images"). */
  pathHint?: string
  /** Storage preference: "auto" (Blob first, GitHub fallback), "blob" (fail if Blob unavailable), "github" (force GitHub). */
  storagePreference?: StoragePreference
}

export interface UploadMediaResult {
  /** Which storage was used. */
  storage: "blob" | "github"
  /** Repo-relative path persisted in MDX (always present). */
  repoPath: string
  /** Auth-proxy preview URL for immediate rendering in Studio. */
  previewUrl: string
  /** Staging marker for publish-ops integration. */
  staged: true
  /** Media op identifier in Convex. */
  mediaOpId: string
  /** Optional diagnostics metadata from the server. */
  diagnostics?: Record<string, string>
  /** Backward compatibility alias for older callers. */
  url?: string
}

/**
 * Upload a media file using the Blob-first + GitHub fallback strategy.
 *
 * @throws Error if upload fails (both Blob and GitHub unavailable).
 */
export async function uploadMedia({
  file,
  projectId,
  userId,
  owner,
  repo,
  branch,
  pathHint,
  storagePreference = "auto",
}: UploadMediaOptions): Promise<UploadMediaResult> {
  // Convert file to base64
  const arrayBuffer = await file.arrayBuffer()
  const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""))

  const response = await fetch("/api/media/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId,
      userId,
      owner,
      repo,
      branch,
      pathHint,
      fileName: file.name,
      contentBase64: base64,
      storagePreference,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Upload failed" }))
    throw new Error(error.error || "Failed to upload media")
  }

  const result = (await response.json()) as UploadMediaResult
  if (!result.url) {
    result.url = result.previewUrl
  }
  return result
}
