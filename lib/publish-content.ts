import matter from "gray-matter"

/**
 * Metadata format provenance for a content file at publish time.
 *
 * - "frontmatter": the file stores metadata as a leading YAML block
 * - "metadata-export": the MDX file stores metadata as `export const metadata = {...}`
 * - "none": the file has no detectable metadata
 */
export type ContentMetadataSource = "frontmatter" | "metadata-export" | "none"

const YAML_FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n/
const METADATA_EXPORT_PATTERN = /^export\s+const\s+metadata\s*=/
const FENCE_PATTERN = /^\s{0,3}(?:```|~~~)/

function isMdxFile(filePath: string) {
  return /\.mdx$/i.test(filePath)
}

/**
 * Line scanner that reports whether any top-level (column-0, non-fenced) line
 * is an `export const metadata =` statement. Deterministic and throw-free by
 * construction: publish decisions must never depend on a full MDX parse that
 * can reject otherwise-publishable documents.
 */
function hasTopLevelMetadataExport(content: string) {
  let inFence = false
  for (const line of content.split(/\r?\n/)) {
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (METADATA_EXPORT_PATTERN.test(line)) return true
  }
  return false
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
  if (YAML_FRONTMATTER_PATTERN.test(rawContent)) {
    return "frontmatter"
  }
  if (isMdxFile(filePath) && hasTopLevelMetadataExport(rawContent)) {
    return "metadata-export"
  }
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
}: {
  filePath: string
  body: string
  frontmatter: Record<string, unknown>
  metadataSource: ContentMetadataSource
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
      return { ok: true, content: body }
    }
    return { ok: true, content: `${formatMetadataExport(frontmatter)}\n\n${body}` }
  }

  if (!hasFrontmatter && metadataSource === "none") {
    return { ok: true, content: body }
  }

  return { ok: true, content: matter.stringify(body, frontmatter) }
}
