const MAX_REPOSITORY_PATH_BYTES = 4_096

function hasControlOrBidi(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x61c ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
      return true
    }
  }
  return false
}

/** The repository-relative path policy enforced by Git batch writes. */
export function assertGitRepositoryPath(path: string): void {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    new TextEncoder().encode(path).byteLength > MAX_REPOSITORY_PATH_BYTES ||
    path.startsWith("/") ||
    path.includes("\\") ||
    hasControlOrBidi(path) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new TypeError("Invalid repository path")
  }
}

/** Durable publish descriptors additionally require NFC canonical paths. */
export function assertCanonicalPublishOperationPath(path: string): void {
  assertGitRepositoryPath(path)
  if (path !== path.normalize("NFC")) {
    throw new TypeError("Publish operation path must be a canonical repository path")
  }
}

/** GitHub path comparisons used by the existing batch write boundary. */
export function gitRepositoryPathIdentity(path: string): string {
  return path.normalize("NFC").toLocaleLowerCase("en-US")
}
