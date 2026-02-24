import { UNIVERSAL_FIELDS } from "../fields"
import type { FrameworkAdapter } from "../types"

export const jekyllAdapter: FrameworkAdapter = {
  id: "jekyll",
  displayName: "Jekyll",
  defaultContentRoots: ["_posts", "_pages", "_docs", "collections"],
  metaFilePattern: null,
  fieldVariants: {
    date: "date",
    author: "author",
    tags: "tags",
    categories: "categories",
    layout: "layout",
    image: "image",
    excerpt: "excerpt",
    slug: "permalink",
  },
  contentArchitecture: {
    hasTaxonomySystem: true,
    fileNamingPattern: "YYYY-MM-DD-title.md",
    architectureNote: "Jekyll uses date-prefixed filenames for posts and _config.yml for site configuration.",
  },
  fields: [
    ...UNIVERSAL_FIELDS,
    { name: "date", type: "date", required: true, description: "Publication date", semanticRole: "date" },
    { name: "author", type: "string", required: false, description: "Post author", semanticRole: "author" },
    { name: "tags", type: "string[]", required: false, description: "Post tags", semanticRole: "tags" },
    { name: "categories", type: "string[]", required: false, description: "Post categories", semanticRole: "categories" },
    { name: "layout", type: "string", required: false, description: "Template layout", semanticRole: "layout" },
    { name: "permalink", type: "string", required: false, description: "Custom URL" },
    { name: "excerpt", type: "string", required: false, description: "Post excerpt", semanticRole: "excerpt" },
    { name: "image", type: "image", required: false, description: "Featured image", semanticRole: "image" },
    { name: "published", type: "boolean", required: false, description: "Whether to publish" },
  ],
  async detect(ctx) {
    let score = 0

    if (ctx.rootFileNames.includes("_config.yml") || ctx.rootFileNames.includes("_config.yaml")) {
      score += 50
    }

    if (ctx.rootFileNames.includes("Gemfile")) {
      const gemContent = await ctx.readFile("Gemfile")
      if (gemContent?.includes("jekyll")) {
        score += 20
      }
    }

    return { score, contentType: "blog" }
  },
}
