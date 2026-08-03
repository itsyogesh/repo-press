import { UNIVERSAL_FIELDS } from "../fields"
import type { FrameworkAdapter } from "../types"

export const nextMdxAdapter: FrameworkAdapter = {
  id: "next-mdx",
  displayName: "Next.js + MDX",
  defaultContentRoots: ["content", "posts", "data", "app"],
  metaFilePattern: null,
  fieldVariants: {
    date: "date",
    author: "author",
    tags: "tags",
    image: "image",
  },
  contentArchitecture: {
    architectureNote: "Generic Next.js with MDX support via @next/mdx, next-mdx-remote, or mdx-bundler.",
  },
  fields: [
    ...UNIVERSAL_FIELDS,
    { name: "date", type: "date", required: false, description: "Publication date", semanticRole: "date" },
    { name: "author", type: "string", required: false, description: "Author name", semanticRole: "author" },
    { name: "tags", type: "string[]", required: false, description: "Post tags", semanticRole: "tags" },
    { name: "image", type: "image", required: false, description: "Cover image", semanticRole: "image" },
  ],
  detect(ctx) {
    let score = 0

    if (ctx.deps.next && (ctx.deps["@next/mdx"] || ctx.deps["next-mdx-remote"] || ctx.deps["mdx-bundler"])) {
      score += 20
    }

    return { score, contentType: "blog" }
  },
}
