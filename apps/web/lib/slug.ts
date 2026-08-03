/**
 * Pure slugify utility.
 * Converts a human-readable title to a URL-safe, filesystem-safe slug.
 *
 * Rules:
 * - Lowercase and trim
 * - Normalize unicode (NFD) and strip diacritics
 * - Replace any character that is not alphanumeric or a hyphen with a hyphen
 * - Collapse multiple consecutive hyphens into one
 * - Trim leading and trailing hyphens
 * - Returns "untitled" if the result is empty
 *
 * TODO: The current unicode normalization (NFD) and regex stripping is insufficient
 * for non-Latin scripts (e.g., CJK, Cyrillic). Consider adopting a comprehensive
 * library (like `github-slugger` or `slugify`) if broader localization is required.
 */
export function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      // Normalize unicode characters (é → e + combining accent) then strip combining marks
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Replace any non-alphanumeric, non-hyphen character with a hyphen
      .replace(/[^a-z0-9-]+/g, "-")
      // Collapse consecutive hyphens
      .replace(/-{2,}/g, "-")
      // Trim leading/trailing hyphens
      .replace(/^-+|-+$/g, "") || "untitled"
  )
}
