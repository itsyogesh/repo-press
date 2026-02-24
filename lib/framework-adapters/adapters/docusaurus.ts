import { UNIVERSAL_FIELDS } from "../fields"
import type { FrameworkAdapter } from "../types"

export const docusaurusAdapter: FrameworkAdapter = {
  id: "docusaurus",
  displayName: "Docusaurus",
  defaultContentRoots: ["docs", "blog", "src/pages"],
  metaFilePattern: "_category_.json",
  fieldVariants: {
    tags: "tags",
    authors: "authors",
    slug: "slug",
    image: "image",
    date: "date",
    order: "sidebar_position",
  },
  contentArchitecture: {
    architectureNote: "Docusaurus uses _category_.json for sidebar structure and supports both docs and blog plugins.",
  },
  fields: [
    ...UNIVERSAL_FIELDS,
    { name: "slug", type: "string", required: false, description: "Custom URL slug", semanticRole: "slug" },
    { name: "tags", type: "string[]", required: false, description: "Post tags", semanticRole: "tags" },
    { name: "authors", type: "string[]", required: false, description: "Author references", semanticRole: "authors" },
    { name: "sidebar_label", type: "string", required: false, description: "Sidebar display text" },
    { name: "sidebar_position", type: "number", required: false, description: "Sidebar sort position", semanticRole: "order" },
    { name: "hide_table_of_contents", type: "boolean", required: false, description: "Hide ToC" },
    { name: "image", type: "image", required: false, description: "Social card image", semanticRole: "image" },
    { name: "date", type: "date", required: false, description: "Publication date", semanticRole: "date" },
  ],
  detect(ctx) {
    let score = 0

    if (ctx.deps["@docusaurus/core"]) {
      score += 50
    }

    if (ctx.rootFileNames.includes("docusaurus.config.js") || ctx.rootFileNames.includes("docusaurus.config.ts")) {
      score += 20
    }

    return { score, contentType: "docs" }
  },
  detectInFolder(ctx) {
    let score = 0

    // _category_.json is a Docusaurus folder marker
    if (ctx.contentRootFileNames.includes("_category_.json")) {
      score += 25
    }

    // Path heuristic
    if (ctx.contentRoot.includes("docs")) {
      score += 10
    }
    if (ctx.contentRoot.includes("blog")) {
      score += 5
    }

    return { score, contentType: ctx.contentRoot.includes("blog") ? "blog" : "docs" }
  },
}
