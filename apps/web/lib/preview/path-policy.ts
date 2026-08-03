export type PathPolicyErrorCode = "EMPTY_DOCUMENT_PATH" | "UNSAFE_RELATIVE_PATH" | "DOCUMENT_OUTSIDE_CONTENT_ROOT"
export type StoredPathRepresentation = "legacy_repo_v0" | "content_relative_v1"
export const CONTENT_PATH_REPRESENTATION = "content_relative_v1" as const

export class PathPolicyError extends Error {
  readonly code: PathPolicyErrorCode

  constructor(code: PathPolicyErrorCode, message: string) {
    super(message)
    this.name = "PathPolicyError"
    this.code = code
  }
}

const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i
const FORMAT_CHARACTER_PATTERN = /\p{Cf}/u

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
  })
}

function assertSafeRelativePath(path: string, kind: "content path" | "content root", allowEmpty: boolean): string {
  if (typeof path !== "string") {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} must be a string`)
  }
  if (path.length === 0) {
    if (allowEmpty) return ""
    throw new PathPolicyError("EMPTY_DOCUMENT_PATH", "content path must identify a document file")
  }
  if (path.startsWith("/")) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} must be relative`)
  }
  if (path.includes("\\")) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} must use POSIX separators`)
  }
  if (hasControlCharacter(path)) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} contains a control character`)
  }
  if (FORMAT_CHARACTER_PATTERN.test(path)) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} contains a Unicode format control`)
  }

  const normalizedPath = path
    .split("/")
    .map((segment) => segment.normalize("NFC"))
    .join("/")
  if (SCHEME_PATTERN.test(normalizedPath)) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} must not be URL- or scheme-like`)
  }
  if (normalizedPath.includes("//")) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} contains duplicate separators`)
  }
  if (normalizedPath.endsWith("/")) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} must not have a trailing separator`)
  }

  const segments = normalizedPath.split("/")
  if (segments.includes("..")) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} escapes content root`)
  }
  if (segments.includes(".")) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} contains a dot segment`)
  }

  return normalizedPath
}

/** Validate the canonical POSIX path stored for a document or explorer operation. */
export function assertContentPath(path: string): string {
  return assertSafeRelativePath(path, "content path", false)
}

/** Validate a repository-relative directory used as a project's content root. */
export function normalizeContentRoot(root: string): string {
  return assertSafeRelativePath(root, "content root", true)
}

/**
 * Convert a canonical stored content-relative file path at a Git/repository
 * boundary. This function never guesses whether the input is already prefixed.
 */
export function toRepoPath(contentRoot: string, contentPath: string): string {
  const root = normalizeContentRoot(contentRoot)
  const path = assertContentPath(contentPath)
  if (!root) return path
  return `${root}/${path}`
}

/**
 * Convert an explicitly repository-relative legacy value after proving that it
 * is a file below the configured content root. Never use this for canonical
 * document/explorer paths.
 */
export function toRepoPathFromLegacyRepoPath(contentRoot: string, legacyRepoPath: string): string {
  const contentPath = toContentPath(contentRoot, legacyRepoPath)
  return toRepoPath(contentRoot, contentPath)
}

/** Resolve stored data using its explicit representation. Untagged rows are legacy v0. */
export function resolveStoredRepoPath(
  contentRoot: string,
  storedPath: string,
  representation?: StoredPathRepresentation,
): string {
  if (representation === CONTENT_PATH_REPRESENTATION) return toRepoPath(contentRoot, storedPath)
  if (representation === undefined || representation === "legacy_repo_v0") {
    return toRepoPathFromLegacyRepoPath(contentRoot, storedPath)
  }
  throw new PathPolicyError("UNSAFE_RELATIVE_PATH", "unknown path representation")
}

/** Convert stored data into canonical content-relative state without guessing. */
export function resolveStoredContentPath(
  contentRoot: string,
  storedPath: string,
  representation?: StoredPathRepresentation,
): string {
  if (representation === CONTENT_PATH_REPRESENTATION) return assertContentPath(storedPath)
  if (representation === undefined || representation === "legacy_repo_v0") {
    return toContentPath(contentRoot, storedPath)
  }
  throw new PathPolicyError("UNSAFE_RELATIVE_PATH", "unknown path representation")
}

/**
 * Resolve persisted path state without allowing a legacy row from an older
 * project content root to take down the current workspace. Invalid persisted
 * rows are isolated; unexpected programmer/runtime failures still propagate.
 */
export function tryResolveStoredContentPath(
  contentRoot: string,
  storedPath: string,
  representation?: StoredPathRepresentation,
): string | null {
  const isLegacyRepresentation = representation === undefined || representation === "legacy_repo_v0"
  try {
    return resolveStoredContentPath(contentRoot, storedPath, representation)
  } catch (error) {
    if (
      isLegacyRepresentation &&
      error instanceof PathPolicyError &&
      (error.code === "DOCUMENT_OUTSIDE_CONTENT_ROOT" || error.code === "EMPTY_DOCUMENT_PATH")
    ) {
      return null
    }
    throw error
  }
}

/** Convert a repository-relative file path into the canonical stored form. */
export function toContentPath(contentRoot: string, repoPath: string): string {
  const root = normalizeContentRoot(contentRoot)
  const path = assertContentPath(repoPath)
  if (!root) return path
  if (path === root) {
    throw new PathPolicyError("EMPTY_DOCUMENT_PATH", "repository path must identify a document file below content root")
  }
  if (!path.startsWith(`${root}/`)) {
    throw new PathPolicyError("DOCUMENT_OUTSIDE_CONTENT_ROOT", "repository path is outside content root")
  }
  return assertContentPath(path.slice(root.length + 1))
}
