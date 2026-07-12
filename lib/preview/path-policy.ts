export type PathPolicyErrorCode = "EMPTY_DOCUMENT_PATH" | "UNSAFE_RELATIVE_PATH" | "DOCUMENT_OUTSIDE_CONTENT_ROOT"

export class PathPolicyError extends Error {
  readonly code: PathPolicyErrorCode

  constructor(code: PathPolicyErrorCode, message: string) {
    super(message)
    this.name = "PathPolicyError"
    this.code = code
  }
}

const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i

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
  if (SCHEME_PATTERN.test(path)) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} must not be URL- or scheme-like`)
  }
  if (path.includes("//")) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} contains duplicate separators`)
  }
  if (path.endsWith("/")) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} must not have a trailing separator`)
  }

  const segments = path.split("/")
  if (segments.includes("..")) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} escapes content root`)
  }
  if (segments.includes(".")) {
    throw new PathPolicyError("UNSAFE_RELATIVE_PATH", `${kind} contains a dot segment`)
  }

  return path
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
 * Convert a stored content-relative file path at a Git/repository boundary.
 * Exact already-prefixed legacy values are accepted here only, so old records
 * remain publishable while new stored paths stay content-root-relative.
 */
export function toRepoPath(contentRoot: string, contentPath: string): string {
  const root = normalizeContentRoot(contentRoot)
  const path = assertContentPath(contentPath)
  if (!root) return path
  if (path === root) {
    throw new PathPolicyError("EMPTY_DOCUMENT_PATH", "content path must identify a document file below content root")
  }
  if (path.startsWith(`${root}/`)) return path
  return `${root}/${path}`
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
