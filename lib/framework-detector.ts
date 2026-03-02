// Thin re-export wrapper — preserves backward compatibility for existing imports.
// All logic now lives in lib/framework-adapters/.

export {
  detectFramework,
  getFrameworkConfig as getFrameworkFields,
  getRegisteredAdapters,
} from "./framework-adapters/registry"
export type { FrameworkConfig, FrontmatterFieldDef } from "./framework-adapters/types"

/** @deprecated Use string type instead. Kept for backward compatibility. */
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
