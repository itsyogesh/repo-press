// Thin re-export wrapper — preserves backward compatibility for existing imports.
// All logic now lives in lib/framework-adapters/.

export type { FrontmatterFieldDef, FrameworkConfig } from "./framework-adapters/types"
export { detectFramework, getFrameworkConfig as getFrameworkFields } from "./framework-adapters/registry"
export { getRegisteredAdapters } from "./framework-adapters/registry"

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
