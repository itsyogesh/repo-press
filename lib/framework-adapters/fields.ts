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
