import { UNIVERSAL_FIELDS } from "../fields"
import type { FrameworkAdapter } from "../types"

export const contentlayerAdapter: FrameworkAdapter = {
  id: "contentlayer",
  displayName: "Contentlayer",
  defaultContentRoots: ["content", "posts", "content/blog"],
  metaFilePattern: null,
  fieldVariants: {
    date: "date",
    authors: "authors",
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
    // heading is used by some contentlayer schemas as the display title (distinct from SEO title)
    {
      name: "heading",
      type: "string",
      required: false,
      description: "Display heading (distinct from SEO title)",
      semanticRole: "title",
    },
    // excerpt is used for blog post cards and meta descriptions
    {
      name: "excerpt",
      type: "string",
      required: false,
      description: "Short excerpt for post cards and meta",
      semanticRole: "description",
    },
    { name: "date", type: "date", required: true, description: "Publication date", semanticRole: "date" },
    // published replaces draft in schemas that use an opt-in published flag (e.g. Collective.domains)
    {
      name: "published",
      type: "boolean",
      required: false,
      description: "Whether this post is published (true = visible)",
      defaultValue: true,
    },
    {
      name: "featured",
      type: "boolean",
      required: false,
      description: "Whether this post is featured",
      defaultValue: false,
    },
    // authors (array) is more common than author (string) in modern contentlayer schemas
    {
      name: "authors",
      type: "string[]",
      required: false,
      description: "Author identifiers (array)",
      semanticRole: "authors",
    },
    { name: "author", type: "string", required: false, description: "Single author name", semanticRole: "author" },
    { name: "keywords", type: "string[]", required: false, description: "SEO keywords" },
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
