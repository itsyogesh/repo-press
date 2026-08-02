import matter from "gray-matter"
import {
  type ContentMetadataSource,
  extractMetadataExportRecovery,
  hasTopLevelMetadataExport,
} from "@/lib/content-metadata"

export type { ContentMetadataSource } from "@/lib/content-metadata"

const YAML_FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n/

function isMdxFile(filePath: string) {
  return /\.mdx$/i.test(filePath)
}

export function bodyEmbedsMetadataExport(body: string) {
  return hasTopLevelMetadataExport(body)
}

/**
 * Detect the metadata format of an existing file's raw content. Used against
 * the publish preflight snapshot so serialization can preserve the format the
 * repository actually uses.
 */
export function detectMetadataSource(rawContent: string, filePath: string): ContentMetadataSource {
  if (YAML_FRONTMATTER_PATTERN.test(rawContent)) return "frontmatter"
  if (isMdxFile(filePath) && hasTopLevelMetadataExport(rawContent)) return "metadata-export"
  return "none"
}

function formatMetadataExport(frontmatter: Record<string, unknown>) {
  return `export const metadata = ${JSON.stringify(frontmatter, null, 2)}`
}

export type SerializePublishContentResult = { ok: true; content: string } | { ok: false; reason: string }

/**
 * Serialize a document for publishing while preserving the repository's
 * metadata format. Fails closed (instead of writing duplicate or converted
 * metadata) when the body already embeds `export const metadata` and separate
 * frontmatter fields also exist - that conflict needs a human decision.
 */
export function serializePublishContent({
  filePath,
  body,
  frontmatter,
  metadataSource,
  existingContent,
}: {
  filePath: string
  body: string
  frontmatter: Record<string, unknown>
  metadataSource: ContentMetadataSource
  existingContent?: string
}): SerializePublishContentResult {
  const hasFrontmatter = Object.keys(frontmatter).length > 0
  const mdx = isMdxFile(filePath)

  if (mdx && bodyEmbedsMetadataExport(body)) {
    if (hasFrontmatter) {
      return {
        ok: false,
        reason:
          "Document body embeds `export const metadata` while separate frontmatter fields exist; merge them into one metadata source before publishing",
      }
    }
    return { ok: true, content: body }
  }

  if (mdx && metadataSource === "metadata-export") {
    if (!hasFrontmatter) {
      const recovery = existingContent ? extractMetadataExportRecovery(existingContent) : null
      if (!recovery) {
        return {
          ok: false,
          reason:
            "Could not recover the existing metadata export from the pinned Git snapshot; publish stopped to prevent metadata loss",
        }
      }
      const bodyPreservesOtherPreamble =
        recovery.preambleWithoutMetadata !== "" && body.startsWith(recovery.preambleWithoutMetadata)
      const preservedMetadata = bodyPreservesOtherPreamble ? recovery.declaration : recovery.fullPreamble
      const separator = bodyPreservesOtherPreamble ? recovery.declarationBodySeparator : "\n\n"
      return { ok: true, content: `${preservedMetadata}${separator}${body.replace(/^\r?\n+/, "")}` }
    }
    const recovery = existingContent ? extractMetadataExportRecovery(existingContent) : null
    if (recovery && body.startsWith(recovery.replacement.bodyBeforeDeclaration)) {
      const bodyAfterDeclaration = body.slice(recovery.replacement.bodyBeforeDeclaration.length)
      return {
        ok: true,
        content: `${recovery.replacement.sourceBeforeDeclaration}${recovery.replacement.declarationPrefix}${formatMetadataExport(frontmatter)}${recovery.replacement.separator}${bodyAfterDeclaration}`,
      }
    }
    if (recovery) {
      return {
        ok: true,
        content: `${recovery.replacement.sourceBeforeDeclaration}${recovery.replacement.declarationPrefix}${formatMetadataExport(frontmatter)}${recovery.replacement.sourceAfterDeclarationPreamble}${body}`,
      }
    }
    return { ok: true, content: `${formatMetadataExport(frontmatter)}\n\n${body}` }
  }

  if (!hasFrontmatter && metadataSource === "none") return { ok: true, content: body }

  return { ok: true, content: matter.stringify(body, frontmatter) }
}
