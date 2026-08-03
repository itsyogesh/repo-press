import { UNIVERSAL_FIELDS } from "../fields"
import type { FrameworkAdapter } from "../types"

export const nextraAdapter: FrameworkAdapter = {
  id: "nextra",
  displayName: "Nextra",
  defaultContentRoots: ["pages", "content", "app"],
  metaFilePattern: "_meta.json",
  fieldVariants: {},
  contentArchitecture: {
    architectureNote: "Nextra uses _meta.json files for sidebar ordering and page configuration.",
  },
  fields: [
    ...UNIVERSAL_FIELDS,
    { name: "searchable", type: "boolean", required: false, description: "Include in search index" },
    { name: "display", type: "string", required: false, description: "Display mode: hidden, children" },
  ],
  detect(ctx) {
    let score = 0

    if (ctx.deps.nextra || ctx.deps["nextra-theme-docs"] || ctx.deps["nextra-theme-blog"]) {
      score += 45
    }

    return {
      score,
      contentType: ctx.deps["nextra-theme-blog"] ? "blog" : "docs",
    }
  },
  detectInFolder(ctx) {
    let score = 0

    // _meta.json is a Nextra folder marker
    if (ctx.contentRootFileNames.includes("_meta.json")) {
      score += 25
    }

    // Path heuristic
    if (ctx.contentRoot.includes("docs") || ctx.contentRoot.includes("pages")) {
      score += 10
    }

    return { score, contentType: "docs" }
  },
}
