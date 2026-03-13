/**
 * Folder context computation.
 *
 * Given a folder path and the project's framework adapter, returns a FolderContext
 * that describes how the Smart Creation Dialog should behave for that folder:
 * - Human-readable content label (e.g. "Blog Post")
 * - Human-readable primary field label (e.g. "Post Title")
 * - Required frontmatter fields (excluding title and draft)
 * - Naming strategy (from adapter, falling back to "slug")
 * - File extension (from adapter, falling back to ".mdx")
 *
 * All computation is synchronous — no async detection per folder.
 */

import type { FrameworkAdapter, FrontmatterFieldDef, NamingStrategy } from "./types"

export type FolderContext = {
  /** Human-friendly content type label, e.g. "Blog Post", "Doc Page" */
  contentLabel: string
  /** Label for the primary title field in the dialog, e.g. "Post Title" */
  primaryFieldLabel: string
  /**
   * Required frontmatter fields beyond title that the user must fill in.
   * Never includes a field with semanticRole === "draft" or semanticRole === "title".
   */
  requiredFields: FrontmatterFieldDef[]
  /** How filenames should be derived from the title */
  namingStrategy: NamingStrategy
  /** File extension for new files */
  fileExtension: ".mdx" | ".md"
}

type KeywordRule = {
  keywords: string[]
  contentLabel: string
  primaryFieldLabel: string
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    keywords: ["blog", "post", "posts", "article", "articles", "news", "essay", "essays"],
    contentLabel: "Blog Post",
    primaryFieldLabel: "Post Title",
  },
  {
    keywords: ["doc", "docs", "documentation", "guide", "guides", "wiki", "help", "kb", "reference", "references"],
    contentLabel: "Doc Page",
    primaryFieldLabel: "Page Name",
  },
  {
    keywords: [
      "author",
      "authors",
      "team",
      "people",
      "writer",
      "writers",
      "contributor",
      "contributors",
      "member",
      "members",
    ],
    contentLabel: "Author",
    primaryFieldLabel: "Full Name",
  },
  {
    keywords: ["changelog", "changes", "release", "releases", "update", "updates"],
    contentLabel: "Release Note",
    primaryFieldLabel: "Release Title",
  },
  {
    keywords: ["page", "pages", "static"],
    contentLabel: "Page",
    primaryFieldLabel: "Page Title",
  },
  {
    keywords: ["tutorial", "tutorials", "lesson", "lessons", "course", "courses"],
    contentLabel: "Tutorial",
    primaryFieldLabel: "Tutorial Title",
  },
  {
    keywords: ["faq", "faqs"],
    contentLabel: "FAQ Entry",
    primaryFieldLabel: "Question",
  },
  {
    keywords: ["project", "projects", "portfolio"],
    contentLabel: "Project",
    primaryFieldLabel: "Project Name",
  },
]

/**
 * Extracts the last meaningful segment of a path and converts it to lowercase.
 * Returns an empty string for the root folder (empty path or "/").
 */
function lastSegment(folderPath: string): string {
  const trimmed = folderPath.replace(/^\/|\/$/g, "")
  if (!trimmed) return ""
  const parts = trimmed.split("/")
  return parts[parts.length - 1].toLowerCase()
}

/**
 * Returns a FolderContext for the given folder path and adapter.
 */
export function getFolderContext(folderPath: string, adapter: FrameworkAdapter): FolderContext {
  const segment = lastSegment(folderPath)

  const namingStrategy: NamingStrategy = adapter.namingStrategy ?? "slug"
  const fileExtension: ".mdx" | ".md" = adapter.fileExtension ?? ".mdx"

  // Fields the user must fill in (excluding title and draft)
  const requiredFields = adapter.fields.filter(
    (f) =>
      f.required &&
      f.semanticRole !== "title" &&
      f.semanticRole !== "draft" &&
      f.name !== "title" &&
      f.name !== "draft",
  )

  // Empty path = repo root
  if (!segment) {
    return {
      contentLabel: "New Page",
      primaryFieldLabel: "Page Title",
      requiredFields,
      namingStrategy,
      fileExtension,
    }
  }

  // Match against keyword rules
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.includes(segment)) {
      return {
        contentLabel: rule.contentLabel,
        primaryFieldLabel: rule.primaryFieldLabel,
        requiredFields,
        namingStrategy,
        fileExtension,
      }
    }
  }

  // No match — fall back to title-cased folder name + " File"
  const folderLabel = segment.charAt(0).toUpperCase() + segment.slice(1)
  return {
    contentLabel: `${folderLabel} File`,
    primaryFieldLabel: "Title",
    requiredFields,
    namingStrategy,
    fileExtension,
  }
}
