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
//     owner: "owner",
//     repo: "repo",
//     branch: "main",
//     storagePreference: "auto", // "auto" | "blob" | "github"
//   })
//   // result.url contains the accessible URL (Blob or GitHub raw)
// ---------------------------------------------------------------------------

export type StoragePreference = "auto" | "blob" | "github"

export interface UploadMediaOptions {
  /** The file to upload. */
  file: File
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
  /** Accessible URL (Blob URL or GitHub raw URL). */
  url: string
  /** GitHub repo-relative path (only for GitHub storage). */
  repoPath?: string
  /** File SHA in GitHub (only for GitHub storage). */
  sha?: string
  /** Commit SHA (only for GitHub storage). */
  commitSha?: string
}

/**
 * Upload a media file using the Blob-first + GitHub fallback strategy.
 *
 * @throws Error if upload fails (both Blob and GitHub unavailable).
 */
export async function uploadMedia({
  file,
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

  return response.json()
}
