import type { FrontmatterFieldDef } from "./types"

export const UNIVERSAL_FIELDS: FrontmatterFieldDef[] = [
  {
    name: "title",
    type: "string",
    required: true,
    description: "Page or post title",
    semanticRole: "title",
  },
  {
    name: "description",
    type: "string",
    required: false,
    description: "SEO meta description",
    semanticRole: "description",
  },
  {
    name: "draft",
    type: "boolean",
    required: false,
    description: "Whether this is a draft",
    defaultValue: false,
    semanticRole: "draft",
  },
]

/** SEO, Open Graph, Twitter, and Schema fields shown as "available to add" in the Frontmatter panel. */
export const SEO_SCHEMA_FIELDS: FrontmatterFieldDef[] = [
  // SEO
  {
    name: "metaTitle",
    type: "string",
    required: false,
    description: "Meta title (≤60 chars)",
    semanticRole: "metaTitle",
    charLimit: 60,
  },
  {
    name: "metaDescription",
    type: "string",
    required: false,
    description: "Meta description (≤160 chars)",
    semanticRole: "metaDescription",
    charLimit: 160,
  },
  {
    name: "focusKeyword",
    type: "string",
    required: false,
    description: "Primary SEO keyword",
    semanticRole: "focusKeyword",
  },
  {
    name: "canonicalUrl",
    type: "string",
    required: false,
    description: "Canonical URL (absolute)",
    semanticRole: "canonicalUrl",
  },
  {
    name: "metaRobots",
    type: "enum",
    required: false,
    description: "Robots directive",
    semanticRole: "metaRobots",
    options: ["index, follow", "noindex, nofollow", "noindex", "noarchive", "noindex, noarchive"],
  },
  {
    name: "lastUpdatedDate",
    type: "date",
    required: false,
    description: "Last updated date",
    semanticRole: "lastModified",
  },
  // Cover image extras
  { name: "imageLink", type: "image", required: false, description: "Cover image URL", semanticRole: "image" },
  {
    name: "imageAltText",
    type: "string",
    required: false,
    description: "Alt text for cover image (text description for accessibility)",
    semanticRole: "imageAltText",
  },
  // Open Graph
  {
    name: "ogTitle",
    type: "string",
    required: false,
    description: "OG title (≤60 chars)",
    semanticRole: "ogTitle",
    charLimit: 60,
  },
  {
    name: "ogDescription",
    type: "string",
    required: false,
    description: "OG description (≤160 chars)",
    semanticRole: "ogDescription",
    charLimit: 160,
  },
  { name: "ogImage", type: "image", required: false, description: "OG image URL", semanticRole: "ogImage" },
  // Twitter
  {
    name: "twitterTitle",
    type: "string",
    required: false,
    description: "Twitter title (≤60 chars)",
    semanticRole: "twitterTitle",
    charLimit: 60,
  },
  {
    name: "twitterDescription",
    type: "string",
    required: false,
    description: "Twitter description (≤160 chars)",
    semanticRole: "twitterDescription",
    charLimit: 160,
  },
  {
    name: "twitterImage",
    type: "image",
    required: false,
    description: "Twitter image URL",
    semanticRole: "twitterImage",
  },
  // Schema
  {
    name: "schemaType",
    type: "enum",
    required: false,
    description: "Structured data schema type",
    semanticRole: "schemaType",
    options: ["BlogPosting", "Article", "WebPage", "Person", "Organization", "FAQPage", "Product", "Review"],
  },
]

/** Full default schema: universal fields + all SEO/OG/Twitter/Schema fields. */
export const EXTENDED_UNIVERSAL_FIELDS: FrontmatterFieldDef[] = [...UNIVERSAL_FIELDS, ...SEO_SCHEMA_FIELDS]
