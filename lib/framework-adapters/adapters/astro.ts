import { UNIVERSAL_FIELDS } from "../fields"
import type { FrameworkAdapter } from "../types"

export const astroAdapter: FrameworkAdapter = {
  id: "astro",
  displayName: "Astro",
  defaultContentRoots: ["src/content/blog", "src/content/docs", "src/content"],
  metaFilePattern: null,
  fieldVariants: {
    date: "pubDate",
    lastModified: "updatedDate",
    image: "image",
    author: "author",
    tags: "tags",
    slug: "slug",
  },
  contentArchitecture: {
    hasConfigSchema: true,
    architectureNote: "Astro uses Zod schemas in src/content/config.ts to validate frontmatter. Uses pubDate instead of date.",
  },
  fields: [
    ...UNIVERSAL_FIELDS,
    { name: "pubDate", type: "date", required: false, description: "Publication date", semanticRole: "date" },
    { name: "updatedDate", type: "date", required: false, description: "Last modified date", semanticRole: "lastModified" },
    { name: "author", type: "string", required: false, description: "Author name or reference", semanticRole: "author" },
    { name: "tags", type: "string[]", required: false, description: "Post tags", semanticRole: "tags" },
    { name: "image", type: "image", required: false, description: "Cover/hero image", semanticRole: "image" },
    { name: "slug", type: "string", required: false, description: "Custom URL slug", semanticRole: "slug" },
  ],
  detect(ctx) {
    let score = 0

    if (ctx.deps.astro) {
      score += 35
    }

    if (
      ctx.rootFileNames.includes("astro.config.mjs") ||
      ctx.rootFileNames.includes("astro.config.ts") ||
      ctx.rootFileNames.includes("astro.config.js")
    ) {
      score += 30
    }

    return { score, contentType: "blog" }
  },
}
