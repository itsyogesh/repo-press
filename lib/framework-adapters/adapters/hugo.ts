import { UNIVERSAL_FIELDS } from "../fields"
import type { FrameworkAdapter } from "../types"

export const hugoAdapter: FrameworkAdapter = {
  id: "hugo",
  displayName: "Hugo",
  defaultContentRoots: ["content", "content/posts", "content/blog", "content/docs"],
  metaFilePattern: null,
  fieldVariants: {
    date: "date",
    lastModified: "lastmod",
    image: "cover",
    authors: "authors",
    tags: "tags",
    categories: "categories",
    description: "summary",
    slug: "slug",
    layout: "layout",
    order: "weight",
  },
  contentArchitecture: {
    hasTaxonomySystem: true,
    architectureNote: "Hugo has first-class taxonomy support (tags, categories, custom). Uses weight for ordering and cover for images.",
  },
  fields: [
    ...UNIVERSAL_FIELDS,
    { name: "date", type: "date", required: true, description: "Publication date", semanticRole: "date" },
    { name: "lastmod", type: "date", required: false, description: "Last modification date", semanticRole: "lastModified" },
    { name: "authors", type: "string[]", required: false, description: "List of authors", semanticRole: "authors" },
    { name: "tags", type: "string[]", required: false, description: "Post tags", semanticRole: "tags" },
    { name: "categories", type: "string[]", required: false, description: "Post categories", semanticRole: "categories" },
    { name: "weight", type: "number", required: false, description: "Sort order weight", semanticRole: "order" },
    { name: "type", type: "string", required: false, description: "Content type (post, page, etc)" },
    { name: "summary", type: "string", required: false, description: "Post summary/excerpt", semanticRole: "excerpt" },
    { name: "cover", type: "image", required: false, description: "Cover image", semanticRole: "image" },
    { name: "slug", type: "string", required: false, description: "Custom URL slug", semanticRole: "slug" },
    { name: "url", type: "string", required: false, description: "Custom permalink" },
    { name: "expiryDate", type: "date", required: false, description: "Expiry date" },
    { name: "publishDate", type: "date", required: false, description: "Future publish date" },
    { name: "layout", type: "string", required: false, description: "Template layout", semanticRole: "layout" },
  ],
  detect(ctx) {
    let score = 0

    if (
      ctx.rootFileNames.includes("hugo.toml") ||
      ctx.rootFileNames.includes("hugo.yaml") ||
      ctx.rootFileNames.includes("hugo.json")
    ) {
      score += 70
    } else if (ctx.rootFileNames.includes("config.toml")) {
      // config.toml is less specific — could be other tools
      score += 50
    }

    return { score, contentType: "blog" }
  },
}
