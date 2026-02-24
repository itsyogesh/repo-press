import { UNIVERSAL_FIELDS } from "../fields"
import type { FrameworkAdapter } from "../types"

export const fumadocsAdapter: FrameworkAdapter = {
  id: "fumadocs",
  displayName: "Fumadocs",
  defaultContentRoots: ["content/docs", "content", "docs", "app/docs"],
  metaFilePattern: "meta.json",
  fieldVariants: {},
  contentArchitecture: {
    hasConfigSchema: true,
    architectureNote: "Fumadocs uses source.config.ts for content source definitions and meta.json for sidebar ordering.",
  },
  fields: [
    ...UNIVERSAL_FIELDS,
    { name: "icon", type: "string", required: false, description: "Fumadocs sidebar icon" },
    { name: "full", type: "boolean", required: false, description: "Full-width page layout" },
  ],
  detect(ctx) {
    let score = 0

    if (ctx.deps["fumadocs-core"] || ctx.deps["fumadocs-ui"] || ctx.deps["fumadocs-mdx"]) {
      score += 40
    }

    if (ctx.rootFileNames.includes("source.config.ts") || ctx.rootFileNames.includes("source.config.mts")) {
      score += 30
    }

    return { score, contentType: "docs" }
  },
  detectInFolder(ctx) {
    let score = 0

    // meta.json is a Fumadocs folder marker
    if (ctx.contentRootFileNames.includes("meta.json")) {
      score += 25
    }

    // Path heuristic: "docs" in the content root bumps docs frameworks
    if (ctx.contentRoot.includes("docs")) {
      score += 10
    }

    return { score, contentType: "docs" }
  },
}
