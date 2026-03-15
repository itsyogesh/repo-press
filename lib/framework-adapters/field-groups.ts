// Shared field grouping constants and helpers used by both the Smart Create dialog
// and the Frontmatter panel. Single source of truth — update here, not in consumers.

import type { MergedFieldDef } from "./resolve"
import type { FieldGroup, FrontmatterFieldDef, GroupedField } from "./types"

export const FIELD_GROUP_MAP: Record<string, FieldGroup> = {
  // Basic fields
  title: "basic",
  heading: "basic",
  date: "basic",
  description: "basic",
  excerpt: "basic",
  draft: "basic",
  author: "basic",
  authors: "basic",
  tags: "basic",
  categories: "basic",
  slug: "basic",
  order: "basic",
  // SEO fields
  metaTitle: "seo",
  metaDescription: "seo",
  focusKeyword: "seo",
  canonicalUrl: "seo",
  metaRobots: "seo",
  lastUpdatedDate: "seo",
  lastUpdated: "seo",
  // Cover image
  image: "coverImage",
  imageLink: "coverImage",
  imageAltText: "coverImage",
  // Open Graph
  ogTitle: "openGraph",
  ogDescription: "openGraph",
  ogImage: "openGraph",
  // Twitter
  twitterTitle: "twitter",
  twitterDescription: "twitter",
  twitterImage: "twitter",
  // Schema
  schemaType: "schema",
}

export const GROUP_LABELS: Record<FieldGroup, string> = {
  basic: "Basic",
  seo: "SEO",
  coverImage: "Cover Image",
  openGraph: "Open Graph",
  twitter: "Twitter",
  schema: "Schema",
  other: "Other",
}

const GROUP_ORDER: FieldGroup[] = ["basic", "seo", "coverImage", "openGraph", "twitter", "schema", "other"]

function buildGroups<T>(fields: T[], getFieldName: (f: T) => string): Record<FieldGroup, T[]> {
  const groups: Record<FieldGroup, T[]> = {
    basic: [],
    seo: [],
    coverImage: [],
    openGraph: [],
    twitter: [],
    schema: [],
    other: [],
  }
  for (const field of fields) {
    const name = getFieldName(field)
    const group = FIELD_GROUP_MAP[name] ?? "other"
    groups[group].push(field)
  }
  return groups
}

/** Group FrontmatterFieldDef[] (used by SmartCreateFileDialog). */
export function groupFields(fields: FrontmatterFieldDef[]): GroupedField<FrontmatterFieldDef>[] {
  const groups = buildGroups(fields, (f) => f.name)
  return GROUP_ORDER.filter((g) => groups[g].length > 0).map((g) => ({
    group: g,
    groupLabel: GROUP_LABELS[g],
    fields: groups[g],
  }))
}

/** Group MergedFieldDef[] (used by FrontmatterPanel). Checks actualFieldName first, then name. */
export function groupMergedFields(fields: MergedFieldDef[]): GroupedField<MergedFieldDef>[] {
  const groups: Record<FieldGroup, MergedFieldDef[]> = {
    basic: [],
    seo: [],
    coverImage: [],
    openGraph: [],
    twitter: [],
    schema: [],
    other: [],
  }
  for (const field of fields) {
    const group = FIELD_GROUP_MAP[field.actualFieldName] ?? FIELD_GROUP_MAP[field.name] ?? "other"
    groups[group].push(field)
  }
  return GROUP_ORDER.filter((g) => groups[g].length > 0).map((g) => ({
    group: g,
    groupLabel: GROUP_LABELS[g],
    fields: groups[g],
  }))
}
