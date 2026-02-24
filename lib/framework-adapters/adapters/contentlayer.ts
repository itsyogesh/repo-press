import { UNIVERSAL_FIELDS } from "../fields"
import type { FrameworkAdapter } from "../types"

export const contentlayerAdapter: FrameworkAdapter = {
  id: "contentlayer",
  displayName: "Contentlayer",
  defaultContentRoots: ["content", "posts", "content/blog"],
  metaFilePattern: null,
  fieldVariants: {
    date: "date",
    author: "author",
    tags: "tags",
    image: "image",
    slug: "slug",
  },
  contentArchitecture: {
    hasReferenceTypes: true,
    hasComputedFields: true,
    hasConfigSchema: true,
    architectureNote:
      "Contentlayer uses defineDocumentType in contentlayer.config.ts to define content schemas. Supports reference types (e.g. authors as separate documents) and computed fields.",
  },
  fields: [
    ...UNIVERSAL_FIELDS,
    { name: "date", type: "date", required: true, description: "Publication date", semanticRole: "date" },
    { name: "author", type: "string", required: false, description: "Author name", semanticRole: "author" },
    { name: "tags", type: "string[]", required: false, description: "Post tags", semanticRole: "tags" },
    { name: "image", type: "image", required: false, description: "Cover image", semanticRole: "image" },
    { name: "slug", type: "string", required: false, description: "Custom URL slug", semanticRole: "slug" },
  ],
  detect(ctx) {
    let score = 0

    if (
      ctx.deps.contentlayer ||
      ctx.deps.contentlayer2 ||
      ctx.deps["next-contentlayer"] ||
      ctx.deps["next-contentlayer2"]
    ) {
      score += 35
    }

    // Config file presence is strong evidence — fixes the Fumadocs priority bug
    if (
      ctx.rootFileNames.includes("contentlayer.config.ts") ||
      ctx.rootFileNames.includes("contentlayer.config.js") ||
      ctx.rootFileNames.includes("contentlayer.config.mjs")
    ) {
      score += 30
    }

    return { score, contentType: "blog" }
  },
}
