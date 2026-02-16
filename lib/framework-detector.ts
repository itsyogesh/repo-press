import type { GitHubFile } from "./github"
import { getFileContent, getRepoContents } from "./github"

export type DetectedFramework =
  | "fumadocs"
  | "nextra"
  | "astro"
  | "hugo"
  | "docusaurus"
  | "jekyll"
  | "contentlayer"
  | "next-mdx"
  | "custom"

export type FrameworkConfig = {
  framework: DetectedFramework
  contentType: "blog" | "docs" | "pages" | "changelog" | "custom"
  suggestedContentRoots: string[]
  frontmatterFields: FrontmatterFieldDef[]
  metaFilePattern: string | null // e.g. "meta.json", "_meta.json"
}

export type FrontmatterFieldDef = {
  name: string
  type: "string" | "string[]" | "number" | "boolean" | "date" | "image"
  required: boolean
  description: string
  defaultValue?: any
}

// Universal frontmatter fields that apply to all frameworks
const UNIVERSAL_FIELDS: FrontmatterFieldDef[] = [
  { name: "title", type: "string", required: true, description: "Page or post title" },
  { name: "description", type: "string", required: false, description: "SEO meta description" },
  { name: "draft", type: "boolean", required: false, description: "Whether this is a draft", defaultValue: false },
]

// Framework-specific field configurations
const FRAMEWORK_FIELDS: Record<DetectedFramework, FrontmatterFieldDef[]> = {
  fumadocs: [
    ...UNIVERSAL_FIELDS,
    { name: "icon", type: "string", required: false, description: "Fumadocs sidebar icon" },
    { name: "full", type: "boolean", required: false, description: "Full-width page layout" },
  ],
  nextra: [
    ...UNIVERSAL_FIELDS,
    { name: "searchable", type: "boolean", required: false, description: "Include in search index" },
    { name: "display", type: "string", required: false, description: "Display mode: hidden, children" },
  ],
  astro: [
    ...UNIVERSAL_FIELDS,
    { name: "pubDate", type: "date", required: false, description: "Publication date" },
    { name: "updatedDate", type: "date", required: false, description: "Last modified date" },
    { name: "author", type: "string", required: false, description: "Author name or reference" },
    { name: "tags", type: "string[]", required: false, description: "Post tags" },
    { name: "image", type: "image", required: false, description: "Cover/hero image" },
    { name: "slug", type: "string", required: false, description: "Custom URL slug" },
  ],
  hugo: [
    ...UNIVERSAL_FIELDS,
    { name: "date", type: "date", required: true, description: "Publication date" },
    { name: "lastmod", type: "date", required: false, description: "Last modification date" },
    { name: "authors", type: "string[]", required: false, description: "List of authors" },
    { name: "tags", type: "string[]", required: false, description: "Post tags" },
    { name: "categories", type: "string[]", required: false, description: "Post categories" },
    { name: "weight", type: "number", required: false, description: "Sort order weight" },
    { name: "type", type: "string", required: false, description: "Content type (post, page, etc)" },
    { name: "summary", type: "string", required: false, description: "Post summary/excerpt" },
    { name: "cover", type: "image", required: false, description: "Cover image" },
    { name: "slug", type: "string", required: false, description: "Custom URL slug" },
    { name: "url", type: "string", required: false, description: "Custom permalink" },
    { name: "expiryDate", type: "date", required: false, description: "Expiry date" },
    { name: "publishDate", type: "date", required: false, description: "Future publish date" },
    { name: "layout", type: "string", required: false, description: "Template layout" },
  ],
  docusaurus: [
    ...UNIVERSAL_FIELDS,
    { name: "slug", type: "string", required: false, description: "Custom URL slug" },
    { name: "tags", type: "string[]", required: false, description: "Post tags" },
    { name: "authors", type: "string[]", required: false, description: "Author references" },
    { name: "sidebar_label", type: "string", required: false, description: "Sidebar display text" },
    { name: "sidebar_position", type: "number", required: false, description: "Sidebar sort position" },
    { name: "hide_table_of_contents", type: "boolean", required: false, description: "Hide ToC" },
    { name: "image", type: "image", required: false, description: "Social card image" },
    { name: "date", type: "date", required: false, description: "Publication date" },
  ],
  jekyll: [
    ...UNIVERSAL_FIELDS,
    { name: "date", type: "date", required: true, description: "Publication date" },
    { name: "author", type: "string", required: false, description: "Post author" },
    { name: "tags", type: "string[]", required: false, description: "Post tags" },
    { name: "categories", type: "string[]", required: false, description: "Post categories" },
    { name: "layout", type: "string", required: false, description: "Template layout" },
    { name: "permalink", type: "string", required: false, description: "Custom URL" },
    { name: "excerpt", type: "string", required: false, description: "Post excerpt" },
    { name: "image", type: "image", required: false, description: "Featured image" },
    { name: "published", type: "boolean", required: false, description: "Whether to publish" },
  ],
  contentlayer: [
    ...UNIVERSAL_FIELDS,
    { name: "date", type: "date", required: true, description: "Publication date" },
    { name: "author", type: "string", required: false, description: "Author name" },
    { name: "tags", type: "string[]", required: false, description: "Post tags" },
    { name: "image", type: "image", required: false, description: "Cover image" },
    { name: "slug", type: "string", required: false, description: "Custom URL slug" },
  ],
  "next-mdx": [
    ...UNIVERSAL_FIELDS,
    { name: "date", type: "date", required: false, description: "Publication date" },
    { name: "author", type: "string", required: false, description: "Author name" },
    { name: "tags", type: "string[]", required: false, description: "Post tags" },
    { name: "image", type: "image", required: false, description: "Cover image" },
  ],
  custom: [...UNIVERSAL_FIELDS],
}

/**
 * Auto-detect the framework used in a GitHub repository by scanning
 * for configuration files and dependencies.
 */
export async function detectFramework(
  token: string,
  owner: string,
  repo: string,
  branch?: string,
): Promise<FrameworkConfig> {
  let packageJson: any = null
  let rootFiles: GitHubFile[] = []

  try {
    const content = await getFileContent(token, owner, repo, "package.json", branch)
    if (content) {
      packageJson = JSON.parse(content)
    }
  } catch {
    // No package.json = possibly Hugo, Jekyll, or non-JS framework
  }

  try {
    rootFiles = await getRepoContents(token, owner, repo, "", branch)
  } catch {
    // Can't read root
  }

  const rootFileNames = rootFiles.map((f) => f.name)
  const deps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  }

  // Detect Hugo
  if (
    rootFileNames.includes("hugo.toml") ||
    rootFileNames.includes("hugo.yaml") ||
    rootFileNames.includes("config.toml")
  ) {
    return {
      framework: "hugo",
      contentType: "blog",
      suggestedContentRoots: ["content", "content/posts", "content/blog", "content/docs"],
      frontmatterFields: FRAMEWORK_FIELDS.hugo,
      metaFilePattern: null,
    }
  }

  // Detect Jekyll
  if (rootFileNames.includes("_config.yml") || rootFileNames.includes("Gemfile")) {
    const hasGemfile = rootFileNames.includes("Gemfile")
    if (hasGemfile) {
      try {
        const gemContent = await getFileContent(token, owner, repo, "Gemfile", branch)
        if (gemContent?.includes("jekyll")) {
          return {
            framework: "jekyll",
            contentType: "blog",
            suggestedContentRoots: ["_posts", "_pages", "_docs", "collections"],
            frontmatterFields: FRAMEWORK_FIELDS.jekyll,
            metaFilePattern: null,
          }
        }
      } catch {
        // Ignore
      }
    }
    if (rootFileNames.includes("_config.yml")) {
      return {
        framework: "jekyll",
        contentType: "blog",
        suggestedContentRoots: ["_posts", "_pages", "_docs"],
        frontmatterFields: FRAMEWORK_FIELDS.jekyll,
        metaFilePattern: null,
      }
    }
  }

  // Detect Fumadocs
  if (deps["fumadocs-core"] || deps["fumadocs-ui"] || deps["fumadocs-mdx"]) {
    return {
      framework: "fumadocs",
      contentType: "docs",
      suggestedContentRoots: ["content/docs", "content", "docs", "app/docs"],
      frontmatterFields: FRAMEWORK_FIELDS.fumadocs,
      metaFilePattern: "meta.json",
    }
  }

  // Detect Nextra
  if (deps.nextra || deps["nextra-theme-docs"] || deps["nextra-theme-blog"]) {
    const contentType = deps["nextra-theme-blog"] ? "blog" : "docs"
    return {
      framework: "nextra",
      contentType,
      suggestedContentRoots: ["pages", "content", "app"],
      frontmatterFields: FRAMEWORK_FIELDS.nextra,
      metaFilePattern: "_meta.json",
    }
  }

  // Detect Docusaurus
  if (deps["@docusaurus/core"]) {
    return {
      framework: "docusaurus",
      contentType: "docs",
      suggestedContentRoots: ["docs", "blog", "src/pages"],
      frontmatterFields: FRAMEWORK_FIELDS.docusaurus,
      metaFilePattern: "_category_.json",
    }
  }

  // Detect Astro
  if (deps.astro || rootFileNames.includes("astro.config.mjs") || rootFileNames.includes("astro.config.ts")) {
    return {
      framework: "astro",
      contentType: "blog",
      suggestedContentRoots: ["src/content/blog", "src/content/docs", "src/content"],
      frontmatterFields: FRAMEWORK_FIELDS.astro,
      metaFilePattern: null,
    }
  }

  // Detect Contentlayer
  if (deps.contentlayer || deps.contentlayer2 || deps["next-contentlayer"] || deps["next-contentlayer2"]) {
    return {
      framework: "contentlayer",
      contentType: "blog",
      suggestedContentRoots: ["content", "posts", "content/blog"],
      frontmatterFields: FRAMEWORK_FIELDS.contentlayer,
      metaFilePattern: null,
    }
  }

  // Detect generic Next.js with MDX
  if (deps.next && (deps["@next/mdx"] || deps["next-mdx-remote"] || deps["mdx-bundler"])) {
    return {
      framework: "next-mdx",
      contentType: "blog",
      suggestedContentRoots: ["content", "posts", "data", "app"],
      frontmatterFields: FRAMEWORK_FIELDS["next-mdx"],
      metaFilePattern: null,
    }
  }

  // Default: custom / unknown
  return {
    framework: "custom",
    contentType: "custom",
    suggestedContentRoots: ["content", "docs", "posts", "pages", ""],
    frontmatterFields: FRAMEWORK_FIELDS.custom,
    metaFilePattern: null,
  }
}

/**
 * Get the frontmatter field definitions for a given framework.
 */
export function getFrameworkFields(framework: DetectedFramework): FrontmatterFieldDef[] {
  return FRAMEWORK_FIELDS[framework] || FRAMEWORK_FIELDS.custom
}
